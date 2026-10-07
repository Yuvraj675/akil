// AKIL Aggregation Service — Control Plane binary
//
// The aggregator receives telemetry streams from node collectors and maintains
// in-memory, sliding-window runtime profiles per workload. It exposes a gRPC
// query API for the scheduler plugin to retrieve profiles.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"strconv"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"net/http"
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
	httpAddr       = flag.String("http-addr", ":8080", "HTTP API address for frontend")
	bucketCount    = flag.Int("bucket-count", 12, "Number of sliding window buckets")
	bucketDuration = flag.Duration("bucket-duration", 5*time.Second, "Duration of each bucket")
)

func main() {
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
	slog.SetDefault(logger)

	logger.Info("AKIL aggregator starting",
		"listen_addr", *listenAddr,
		"http_addr", *httpAddr,
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

	// Start gRPC server
	lis, err := net.Listen("tcp", *listenAddr)
	if err != nil {
		logger.Error("failed to listen", "error", err)
		os.Exit(1)
	}
	go func() {
		logger.Info("gRPC server listening", "addr", lis.Addr().String())
		if err := server.Serve(lis); err != nil {
			logger.Error("gRPC server failed", "error", err)
			cancel()
		}
	}()

	// Start HTTP API server
	mux := http.NewServeMux()
	
	mux.HandleFunc("/api/profiles", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.WriteHeader(http.StatusOK)
			return
		}
		
		w.Header().Set("Content-Type", "application/json")
		keys := store.Keys()
		profiles := make([]profile.RuntimeProfile, 0, len(keys))
		for _, k := range keys {
			profiles = append(profiles, store.QueryProfile(k))
		}
		json.NewEncoder(w).Encode(profiles)
	})

	mux.HandleFunc("/api/simulate-events", func(w http.ResponseWriter, r *http.Request) {
		// Allows frontend to trigger simulated telemetry without needing a real collector running
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		type SimulateReq struct {
			WorkloadKey string `json:"workload_key"`
			NodeName    string `json:"node_name"`
			PageFaults  int    `json:"page_faults"`
			CacheMisses int    `json:"cache_misses"`
			LockNs      int64  `json:"lock_ns"`
			CtxSwitches int    `json:"ctx_switches"`
		}
		var req SimulateReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		
		wp := store.GetOrCreate(req.WorkloadKey)
		for i := 0; i < req.PageFaults; i++ { wp.RecordPageFault(req.NodeName) }
		if req.CacheMisses > 0 { wp.RecordCacheMiss(int64(req.CacheMisses), req.NodeName) }
		if req.LockNs > 0 { wp.RecordLockContention(req.LockNs, req.NodeName) }
		for i := 0; i < req.CtxSwitches; i++ { wp.RecordCtxSwitch(req.NodeName) }
		
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	var clientset *kubernetes.Clientset
	config, err := rest.InClusterConfig()
	if err == nil {
		clientset, err = kubernetes.NewForConfig(config)
		if err != nil {
			logger.Warn("Failed to create k8s client", "err", err)
			clientset = nil
		}
	} else {
		logger.Warn("Not running in cluster, real scaling disabled", "err", err)
	}

	mux.HandleFunc("/api/scale", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Content-Type", "application/json")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		namespace := "default"
		deploymentName := "demo-workload"

		if r.Method == "GET" {
			if clientset == nil {
				json.NewEncoder(w).Encode(map[string]int{"replicas": 1})
				return
			}
			scale, err := clientset.AppsV1().Deployments(namespace).GetScale(context.Background(), deploymentName, metav1.GetOptions{})
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]int32{"replicas": scale.Spec.Replicas})
			return
		}

		if r.Method == "POST" {
			if clientset == nil {
				json.NewEncoder(w).Encode(map[string]bool{"success": true, "simulated": true})
				return
			}
			replicasStr := r.URL.Query().Get("replicas")
			replicas, err := strconv.Atoi(replicasStr)
			if err != nil || replicas < 0 || replicas > 10 {
				http.Error(w, "invalid replicas", http.StatusBadRequest)
				return
			}
			
			scale, err := clientset.AppsV1().Deployments(namespace).GetScale(context.Background(), deploymentName, metav1.GetOptions{})
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			
			scale.Spec.Replicas = int32(replicas)
			_, err = clientset.AppsV1().Deployments(namespace).UpdateScale(context.Background(), deploymentName, scale, metav1.UpdateOptions{})
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			
			json.NewEncoder(w).Encode(map[string]bool{"success": true})
		}
	})

	mux.HandleFunc("/api/autoscale/enable", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == "OPTIONS" { return }
		setAutoscaling(true)
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})
	mux.HandleFunc("/api/autoscale/disable", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == "OPTIONS" { return }
		setAutoscaling(false)
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})
	mux.HandleFunc("/api/autoscale/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(map[string]bool{"enabled": getAutoscaling()})
	})
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(getScalingLogs())
	})

	mux.HandleFunc("/api/pods/create", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		if r.Method == "OPTIONS" { return }
		
		name := r.URL.Query().Get("name")
		if name == "" || clientset == nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		
		replicas := int32(1)
		deployment := &appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name: name,
			},
			Spec: appsv1.DeploymentSpec{
				Replicas: &replicas,
				Selector: &metav1.LabelSelector{
					MatchLabels: map[string]string{"app": name},
				},
				Template: corev1.PodTemplateSpec{
					ObjectMeta: metav1.ObjectMeta{
						Labels: map[string]string{"app": name},
					},
					Spec: corev1.PodSpec{
						Containers: []corev1.Container{
							{
								Name:  "workload",
								Image: "alpine",
								Command: []string{"/bin/sh", "-c"},
								Args: []string{"while true; do sleep 1; done"},
							},
						},
					},
				},
			},
		}
		
		_, err := clientset.AppsV1().Deployments("default").Create(context.Background(), deployment, metav1.CreateOptions{})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	// Start adaptive autoscaler loop
	go startAutoscalerLoop(ctx, store, clientset, logger)

	httpServer := &http.Server{Addr: *httpAddr, Handler: mux}
	go func() {
		logger.Info("HTTP server listening", "addr", *httpAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("HTTP server failed", "error", err)
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
	httpServer.Shutdown(context.Background())
	logger.Info("aggregator stopped")
}

// aggregatorService implements the AkilTelemetry gRPC service.
type aggregatorService struct {
	pb.UnimplementedAkilTelemetryServer
	store  *profile.Store
	logger *slog.Logger
}

func (s *aggregatorService) StreamTelemetry(stream pb.AkilTelemetry_StreamTelemetryServer) error {
	s.logger.Info("new collector stream connected")
	for {
		batch, err := stream.Recv()
		if err == io.EOF { return nil }
		if err != nil { return err }

		eventsProcessed := 0
		for _, evt := range batch.Events {
			if evt.WorkloadKey == "" { continue }
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

		stream.Send(&pb.IngestAck{AckedTimestampNs: batch.BatchTimestampNs})
	}
}

func (s *aggregatorService) QueryProfile(ctx context.Context, req *pb.ProfileRequest) (*pb.RuntimeProfile, error) {
	if req.WorkloadKey == "" { return nil, fmt.Errorf("workload_key required") }
	p := s.store.QueryProfile(req.WorkloadKey)
	return profileToProto(p), nil
}

func (s *aggregatorService) QueryNodeProfiles(ctx context.Context, req *pb.NodeProfilesRequest) (*pb.NodeProfilesResponse, error) {
	if req.NodeName == "" { return nil, fmt.Errorf("node_name required") }
	profiles := s.store.QueryNodeProfiles(req.NodeName)
	resp := &pb.NodeProfilesResponse{Profiles: make([]*pb.RuntimeProfile, len(profiles))}
	for i, p := range profiles { resp.Profiles[i] = profileToProto(p) }
	return resp, nil
}

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
