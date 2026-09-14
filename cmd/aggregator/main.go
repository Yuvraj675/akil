// AKIL Aggregation Service — Control Plane binary
//
// The aggregator receives telemetry streams from node collectors and maintains
// in-memory, sliding-window runtime profiles per workload. It exposes a gRPC
// query API for the scheduler plugin to retrieve profiles.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"

	"github.com/Yuvraj675/akil/pkg/profile"
	pb "github.com/Yuvraj675/akil/pkg/proto"
)

var (
	listenAddr     = flag.String("listen-addr", ":50051", "gRPC listen address")
	bucketCount    = flag.Int("bucket-count", 12, "Number of sliding window buckets")
	bucketDuration = flag.Duration("bucket-duration", 5*time.Second, "Duration of each bucket")
)

func main() {
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	logger.Info("AKIL aggregator starting",
		"listen_addr", *listenAddr,
		"bucket_count", *bucketCount,
		"bucket_duration", *bucketDuration,
	)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// Initialize the profile store
	store := profile.NewStore(*bucketCount, *bucketDuration)

	// Create gRPC server
	server := grpc.NewServer()
	svc := &aggregatorService{
		store:  store,
		logger: logger,
	}
	pb.RegisterAkilTelemetryServer(server, svc)

	// Start listening
	lis, err := net.Listen("tcp", *listenAddr)
	if err != nil {
		logger.Error("failed to listen", "error", err)
		os.Exit(1)
	}

	// Start server in background
	go func() {
		logger.Info("gRPC server listening", "addr", lis.Addr().String())
		if err := server.Serve(lis); err != nil {
			logger.Error("gRPC server failed", "error", err)
			cancel()
		}
	}()

	// Start profile stats reporter
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				logger.Info("profile store stats",
					"active_profiles", store.ActiveProfiles(),
				)
			case <-ctx.Done():
				return
			}
		}
	}()

	// Wait for shutdown
	<-ctx.Done()
	logger.Info("shutting down aggregator")
	server.GracefulStop()
	logger.Info("aggregator stopped")
}

// aggregatorService implements the AkilTelemetry gRPC service.
type aggregatorService struct {
	pb.UnimplementedAkilTelemetryServer
	store  *profile.Store
	logger *slog.Logger
}

// StreamTelemetry handles bidirectional streaming from collectors.
func (s *aggregatorService) StreamTelemetry(stream pb.AkilTelemetry_StreamTelemetryServer) error {
	s.logger.Info("new collector stream connected")

	for {
		batch, err := stream.Recv()
		if err == io.EOF {
			s.logger.Info("collector stream closed normally")
			return nil
		}
		if err != nil {
			s.logger.Warn("collector stream error", "error", err)
			return err
		}

		// Process each event in the batch
		eventsProcessed := 0
		for _, evt := range batch.Events {
			if evt.WorkloadKey == "" {
				continue
			}

			wp := s.store.GetOrCreate(evt.WorkloadKey)

			switch evt.EventType {
			case pb.EventType_EVENT_TYPE_PAGE_FAULT:
				wp.RecordPageFault(batch.NodeName)

			case pb.EventType_EVENT_TYPE_CACHE_MISS:
				if cm := evt.GetCacheMiss(); cm != nil {
					wp.RecordCacheMiss(int64(cm.MissCountDelta), batch.NodeName)
				}

			case pb.EventType_EVENT_TYPE_LOCK_CONTENTION:
				if lc := evt.GetLockContention(); lc != nil {
					wp.RecordLockContention(lc.DurationNs, batch.NodeName)
				}

			case pb.EventType_EVENT_TYPE_CONTEXT_SWITCH:
				wp.RecordCtxSwitch(batch.NodeName)
			}

			eventsProcessed++
		}

		// Send ack
		ack := &pb.IngestAck{
			AckedTimestampNs: batch.BatchTimestampNs,
			ApplyBackpressure: false,
		}
		if err := stream.Send(ack); err != nil {
			s.logger.Warn("failed to send ack", "error", err)
			return err
		}

		s.logger.Debug("batch processed",
			"node", batch.NodeName,
			"events", eventsProcessed,
		)
	}
}

// QueryProfile returns the runtime profile for a single workload.
func (s *aggregatorService) QueryProfile(ctx context.Context, req *pb.ProfileRequest) (*pb.RuntimeProfile, error) {
	if req.WorkloadKey == "" {
		return nil, fmt.Errorf("workload_key is required")
	}

	p := s.store.QueryProfile(req.WorkloadKey)
	return profileToProto(p), nil
}

// QueryNodeProfiles returns all runtime profiles for workloads on a given node.
func (s *aggregatorService) QueryNodeProfiles(ctx context.Context, req *pb.NodeProfilesRequest) (*pb.NodeProfilesResponse, error) {
	if req.NodeName == "" {
		return nil, fmt.Errorf("node_name is required")
	}

	profiles := s.store.QueryNodeProfiles(req.NodeName)
	resp := &pb.NodeProfilesResponse{
		Profiles: make([]*pb.RuntimeProfile, len(profiles)),
	}
	for i, p := range profiles {
		resp.Profiles[i] = profileToProto(p)
	}
	return resp, nil
}

// profileToProto converts an internal RuntimeProfile to a protobuf RuntimeProfile.
func profileToProto(p profile.RuntimeProfile) *pb.RuntimeProfile {
	return &pb.RuntimeProfile{
		WorkloadKey:         p.WorkloadKey,
		PageFaultRate:       p.PageFaultRate,
		CacheMissRate:       p.CacheMissRate,
		LockContentionRatio: p.LockContentionRatio,
		ContextSwitchRate:   p.ContextSwitchRate,
		SampleCount:         p.SampleCount,
		WindowStartNs:       p.WindowStart.UnixNano(),
		WindowEndNs:         p.WindowEnd.UnixNano(),
		Confidence:          pb.ProfileConfidence(p.Confidence),
	}
}
