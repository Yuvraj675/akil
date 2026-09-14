// AKIL Collector — DaemonSet binary
//
// The collector runs on every Kubernetes node and is responsible for:
//  1. Loading eBPF programs into the kernel
//  2. Reading events from the shared BPF ring buffer
//  3. Resolving cgroup IDs to Kubernetes pod identity
//  4. Batching events and streaming them to the aggregation service via gRPC
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	akilebpf "github.com/Yuvraj675/akil/pkg/ebpf"
	pb "github.com/Yuvraj675/akil/pkg/proto"
	"github.com/Yuvraj675/akil/pkg/telemetry"
)

var (
	aggregatorAddr = flag.String("aggregator-addr", "akil-aggregator.akil-system:50051",
		"Address of the AKIL aggregation service")
	nodeName = flag.String("node-name", "",
		"Kubernetes node name (from downward API)")
	kubeletURL = flag.String("kubelet-url", "https://localhost:10250",
		"Local kubelet API URL")
	ringBufferSize = flag.Int("ring-buffer-size", 16*1024*1024,
		"BPF ring buffer size in bytes")
	batchMaxEvents = flag.Int("batch-max-events", 1000,
		"Maximum events per batch")
	batchInterval = flag.Duration("batch-interval", 1*time.Second,
		"Maximum time between batch flushes")
)

func main() {
	flag.Parse()

	// Set up structured logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	logger.Info("AKIL collector starting",
		"aggregator_addr", *aggregatorAddr,
		"node_name", *nodeName,
		"ring_buffer_size", *ringBufferSize,
	)

	// Resolve node name from environment if not specified
	if *nodeName == "" {
		*nodeName = os.Getenv("NODE_NAME")
	}
	if *nodeName == "" {
		logger.Error("node name not specified (use --node-name or NODE_NAME env)")
		os.Exit(1)
	}

	// Set up context with signal handling
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// Check BPF support
	if err := akilebpf.CheckBPFSupport(); err != nil {
		logger.Warn("BPF support check failed (running in degraded mode)", "error", err)
	}

	// Initialize eBPF loader
	loader, err := akilebpf.NewLoader(akilebpf.LoaderConfig{
		RingBufferSize: *ringBufferSize,
		Logger:         logger,
	})
	if err != nil {
		logger.Error("failed to initialize eBPF loader", "error", err)
		os.Exit(1)
	}
	defer loader.Close()

	// Initialize cgroup resolver
	resolver := telemetry.NewCgroupResolver(telemetry.CgroupResolverConfig{
		KubeletURL: *kubeletURL,
		NodeName:   *nodeName,
		Logger:     logger,
	})

	// Initialize batch assembler
	batcher := telemetry.NewBatchAssembler(telemetry.BatchAssemblerConfig{
		MaxEvents:     *batchMaxEvents,
		FlushInterval: *batchInterval,
		NodeName:      *nodeName,
		Logger:        logger,
	})

	// Connect to aggregator via gRPC
	conn, err := grpc.NewClient(*aggregatorAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		logger.Error("failed to connect to aggregator", "error", err)
		os.Exit(1)
	}
	defer conn.Close()

	client := pb.NewAkilTelemetryClient(conn)

	// Start the gRPC stream
	stream, err := client.StreamTelemetry(ctx)
	if err != nil {
		logger.Error("failed to open telemetry stream", "error", err)
		os.Exit(1)
	}

	// Start batch assembler
	go batcher.Start()

	// Start event processing pipeline: eBPF events → resolve → batch → stream
	go func() {
		for rawEvt := range loader.Events() {
			// Resolve cgroup ID to pod identity
			identity, err := resolver.Resolve(rawEvt.CgroupID)
			if err != nil {
				// Skip events for unresolvable cgroups (system processes, etc.)
				continue
			}

			tagged := telemetry.TaggedEvent{
				RawEvent: rawEvt,
				Identity: identity,
			}
			batcher.Add(tagged)
		}
	}()

	// Start gRPC batch sender
	go func() {
		for batch := range batcher.Batches() {
			if err := stream.Send(batch); err != nil {
				logger.Warn("failed to send batch", "error", err)
				// On stream error, events are dropped (by design — not lossless)
				continue
			}
		}
	}()

	// Start eBPF ring buffer reader (blocks until context is cancelled)
	go func() {
		if err := loader.Start(ctx); err != nil && ctx.Err() == nil {
			logger.Error("eBPF loader failed", "error", err)
			cancel()
		}
	}()

	// Start periodic cache eviction
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				evicted := resolver.EvictExpired()
				if evicted > 0 {
					logger.Debug("evicted expired cgroup cache entries", "count", evicted)
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	// Wait for shutdown signal
	<-ctx.Done()
	logger.Info("shutting down collector")

	batcher.Stop()

	if err := stream.CloseSend(); err != nil {
		logger.Warn("error closing gRPC stream", "error", err)
	}

	logger.Info("collector stopped")
}
