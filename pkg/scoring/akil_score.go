//go:build ignore


package scoring

import (
	"context"
	"fmt"
	"log/slog"

	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/kubernetes/pkg/scheduler/framework"
	
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/Yuvraj675/akil/pkg/proto"
)

const Name = "AkilScore"

type AkilScorePlugin struct {
	handle framework.Handle
	client pb.AkilTelemetryClient
	logger *slog.Logger
}

func New(obj runtime.Object, handle framework.Handle) (framework.Plugin, error) {
	logger := slog.Default()
	
	// Hardcode for demo/phase2. In reality, read from obj (KubeSchedulerConfiguration config)
	conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to dial aggregator: %w", err)
	}

	return &AkilScorePlugin{
		handle: handle,
		client: pb.NewAkilTelemetryClient(conn),
		logger: logger,
	}, nil
}

func (p *AkilScorePlugin) Name() string {
	return Name
}

func (p *AkilScorePlugin) Score(ctx context.Context, state *framework.CycleState, pod *v1.Pod, nodeName string) (int64, *framework.Status) {
	// 1. Determine workload key for candidate pod
	workloadKey := getWorkloadKey(pod)
	if workloadKey == "" {
		return 50, nil // Neutral score if no key
	}

	// 2. Query Candidate Profile
	candResp, err := p.client.QueryProfile(ctx, &pb.ProfileRequest{WorkloadKey: workloadKey})
	if err != nil || candResp.Confidence == pb.ProfileConfidence_UNKNOWN {
		p.logger.Warn("Failed to query profile for candidate, returning neutral", "workload", workloadKey, "err", err)
		return 50, nil
	}

	// 3. Query Node Profiles
	nodeResp, err := p.client.QueryNodeProfiles(ctx, &pb.NodeProfilesRequest{NodeName: nodeName})
	if err != nil {
		p.logger.Warn("Failed to query node profiles, returning neutral", "node", nodeName, "err", err)
		return 50, nil
	}

	// 4. Compute Penalty
	totalPenalty := 0.0
	for _, np := range nodeResp.Profiles {
		// Cache Penalty (Max Rate ~ 1000)
		cachePenalty := min(candResp.CacheMissRate, np.CacheMissRate) / 1000.0 * 35.0
		
		// Lock Penalty
		lockPenalty := (candResp.LockContentionRatio + np.LockContentionRatio) * 30.0
		
		// Page Fault Penalty (Max Rate ~ 5000)
		pfPenalty := (candResp.PageFaultRate + np.PageFaultRate) / 5000.0 * 20.0
		
		// Ctx Switch Penalty (Max Rate ~ 10000)
		ctxPenalty := (candResp.ContextSwitchRate + np.ContextSwitchRate) / 10000.0 * 15.0

		totalPenalty += cachePenalty + lockPenalty + pfPenalty + ctxPenalty
	}

	score := int64(100.0 - totalPenalty)
	if score < 0 { score = 0 }
	if score > 100 { score = 100 }

	p.logger.Info("Computed AKIL score", "pod", pod.Name, "node", nodeName, "score", score)
	return score, nil
}

func (p *AkilScorePlugin) ScoreExtensions() framework.ScoreExtensions {
	return nil
}

func getWorkloadKey(pod *v1.Pod) string {
	if len(pod.OwnerReferences) > 0 {
		ref := pod.OwnerReferences[0]
		return fmt.Sprintf("%s/%s/%s", pod.Namespace, ref.Kind, ref.Name)
	}
	return fmt.Sprintf("%s/Pod/%s", pod.Namespace, pod.Name)
}

func min(a, b float64) float64 {
	if a < b { return a }
	return b
}
