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

	"encoding/binary"

	"github.com/Yuvraj675/akil/pkg/cgroup"
	"github.com/Yuvraj675/akil/pkg/ebpf"
	pb "github.com/Yuvraj675/akil/pkg/proto"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
)

var (
	aggregatorAddr = flag.String("aggregator", "localhost:50051", "Aggregator gRPC address")
	nodeName       = flag.String("node-name", "worker-node-01", "Node name reporting")
)

func main() {
	flag.Parse()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	slog.SetDefault(logger)
	
	logger.Info("AKIL Collector starting", "node", *nodeName, "aggregator", *aggregatorAddr)

	// Load pre-compiled eBPF programs
	var objs ebpf.BpfObjects
	if err := ebpf.LoadBpfObjects(&objs, nil); err != nil {
		logger.Error("failed to load objects", "error", err)
		os.Exit(1)
	}
	defer objs.Close()

	// Attach tracepoints
	tpPF, err := link.Tracepoint("exceptions", "page_fault_user", objs.HandlePageFault, nil)
	if err != nil {
		logger.Error("failed to attach page fault", "error", err)
		os.Exit(1)
	}
	defer tpPF.Close()

	tpCS, err := link.Tracepoint("sched", "sched_switch", objs.HandleSchedSwitch, nil)
	if err != nil {
		logger.Error("failed to attach sched switch", "error", err)
		os.Exit(1)
	}
	defer tpCS.Close()

	logger.Info("eBPF probes attached successfully")

	// Open BPF ring buffer
	reader, err := ringbuf.NewReader(objs.Events)
	if err != nil {
		logger.Error("failed to create ringbuf reader", "error", err)
		os.Exit(1)
	}
	defer reader.Close()

	
	// Start cgroup resolver
	var resolver *cgroup.Resolver
	var errRes error
	resolver, errRes = cgroup.NewResolver(*nodeName)
	if errRes != nil {
		logger.Warn("failed to init cgroup resolver, using raw IDs", "error", errRes)
	} else {
		logger.Info("cgroup resolver started")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if resolver != nil {
		go resolver.Start(ctx)
	}


	// Connect to aggregator
	conn, err := grpc.Dial(*aggregatorAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		logger.Error("failed to connect to aggregator", "error", err)
		os.Exit(1)
	}
	defer conn.Close()

	client := pb.NewAkilTelemetryClient(conn)
	stream, err := client.StreamTelemetry(ctx)
	if err != nil {
		logger.Error("failed to open telemetry stream", "error", err)
		os.Exit(1)
	}

	logger.Info("Streaming to aggregator...")

	go func() {
		<-ctx.Done()
		reader.Close()
	}()

	batch := &pb.TelemetryBatch{
		NodeName: *nodeName,
		Events:   make([]*pb.TelemetryEvent, 0, 100),
	}
	
	lastFlush := time.Now()

	for {
		record, err := reader.Read()
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			logger.Error("read from ringbuf failed", "error", err)
			continue
		}

		if len(record.RawSample) < 24 {
			continue
		}

		// Parse the struct event_t
		eventType := record.RawSample[0]
		// Cgroup ID is bytes 8-15, Timestamp is bytes 16-23 (little endian, assuming 64-bit aligned)
		
		cgroupID := binary.LittleEndian.Uint64(record.RawSample[8:16])
		
		wk := ""
		if resolver != nil {
			wk = resolver.Resolve(cgroupID)
		}
		if wk == "" {
			// fallback or ignore if not a k8s pod
			continue
		}

		evt := &pb.TelemetryEvent{
			EventType:   pb.EventType(eventType),
			WorkloadKey: wk,
			TimestampNs: time.Now().UnixNano(),
		}

		batch.Events = append(batch.Events, evt)

		if len(batch.Events) >= 100 || time.Since(lastFlush) > time.Second {
			batch.BatchTimestampNs = time.Now().UnixNano()
			if err := stream.Send(batch); err != nil {
				logger.Warn("failed to send batch", "error", err)
			}
			batch.Events = make([]*pb.TelemetryEvent, 0, 100)
			lastFlush = time.Now()
		}
	}
	
	logger.Info("Collector shutdown complete")
}
