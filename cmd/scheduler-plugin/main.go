// AKIL Scheduler Plugin — Kubernetes Scheduling Framework Score Plugin
//
// This package implements the AKIL Score plugin for the Kubernetes Scheduling
// Framework. It queries the aggregation service for workload runtime profiles
// and adjusts node scores based on co-location penalty analysis.
//
// In production, this is compiled into a custom kube-scheduler binary.
// For Phase 1, the plugin logic is implemented as a standalone package that
// can be integrated once the k8s.io/kubernetes dependency is configured.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/Yuvraj675/akil/pkg/profile"
	pb "github.com/Yuvraj675/akil/pkg/proto"
	"github.com/Yuvraj675/akil/pkg/scoring"
)

const (
	// PluginName is the name registered with the Kubernetes Scheduling Framework.
	PluginName = "AkilScore"
)

// AkilScorePlugin implements the AKIL scoring logic.
// In production, this implements framework.ScorePlugin from k8s.io/kubernetes.
type AkilScorePlugin struct {
	client        pb.AkilTelemetryClient
	scorer        *scoring.Scorer
	queryTimeout  time.Duration
	logger        *slog.Logger
}

// AkilScoreArgs are the plugin configuration arguments.
type AkilScoreArgs struct {
	AggregatorAddress string  `json:"aggregatorAddress"`
	WeightCache       float64 `json:"weightCache,omitempty"`
	WeightLock        float64 `json:"weightLock,omitempty"`
	WeightPageFault   float64 `json:"weightPageFault,omitempty"`
	WeightCtxSwitch   float64 `json:"weightCtxSwitch,omitempty"`
	QueryTimeoutMs    int     `json:"queryTimeoutMs,omitempty"`
}

// Name returns the plugin name.
func (p *AkilScorePlugin) Name() string {
	return PluginName
}

// Score computes the AKIL co-location penalty score for a candidate node.
//
// Parameters:
//   - workloadKey: the candidate pod's workload identity (e.g., "default/Deployment/web")
//   - nodeName: the candidate node
//
// Returns a score in [0, 100] where higher is better.
func (p *AkilScorePlugin) Score(ctx context.Context, workloadKey string, nodeName string) (int64, string, error) {
	if workloadKey == "" {
		return scoring.NeutralScore, "no workload key derivable", nil
	}

	// Create timeout context for gRPC queries
	queryCtx, cancel := context.WithTimeout(ctx, p.queryTimeout)
	defer cancel()

	// Query candidate workload profile
	candidateResp, err := p.client.QueryProfile(queryCtx, &pb.ProfileRequest{
		WorkloadKey: workloadKey,
	})
	if err != nil {
		p.logger.Warn("failed to query candidate profile",
			"workload", workloadKey, "error", err)
		return scoring.NeutralScore, "aggregator query failed, using neutral score", nil
	}

	candidateProfile := protoToProfile(candidateResp)

	// Query all profiles on the candidate node
	nodeResp, err := p.client.QueryNodeProfiles(queryCtx, &pb.NodeProfilesRequest{
		NodeName: nodeName,
	})
	if err != nil {
		p.logger.Warn("failed to query node profiles",
			"node", nodeName, "error", err)
		return scoring.NeutralScore, "node profile query failed, using neutral score", nil
	}

	var colocatedProfiles []profile.RuntimeProfile
	for _, pp := range nodeResp.Profiles {
		colocatedProfiles = append(colocatedProfiles, protoToProfile(pp))
	}

	// Compute score using the scoring engine
	result := p.scorer.Score(candidateProfile, colocatedProfiles)

	p.logger.Debug("score computed",
		"workload", workloadKey,
		"node", nodeName,
		"score", result.Score,
		"total_penalty", result.TotalPenalty,
		"reason", result.Reason,
	)

	return result.Score, result.Reason, nil
}

// DeriveWorkloadKey extracts the workload identity from pod metadata.
// In production, this reads from v1.Pod owner references.
// Format: "namespace/Kind/name"
func DeriveWorkloadKey(namespace, ownerKind, ownerName string) string {
	if ownerKind == "ReplicaSet" {
		// ReplicaSet names follow the pattern: <deployment-name>-<hash>
		for i := len(ownerName) - 1; i >= 0; i-- {
			if ownerName[i] == '-' {
				ownerName = ownerName[:i]
				break
			}
		}
		ownerKind = "Deployment"
	}
	return fmt.Sprintf("%s/%s/%s", namespace, ownerKind, ownerName)
}

// protoToProfile converts a protobuf RuntimeProfile to an internal profile.RuntimeProfile.
func protoToProfile(p *pb.RuntimeProfile) profile.RuntimeProfile {
	if p == nil {
		return profile.RuntimeProfile{Confidence: profile.ConfidenceUnknown}
	}

	return profile.RuntimeProfile{
		WorkloadKey:         p.WorkloadKey,
		PageFaultRate:       p.PageFaultRate,
		CacheMissRate:       p.CacheMissRate,
		LockContentionRatio: p.LockContentionRatio,
		ContextSwitchRate:   p.ContextSwitchRate,
		SampleCount:         p.SampleCount,
		WindowStart:         time.Unix(0, p.WindowStartNs),
		WindowEnd:           time.Unix(0, p.WindowEndNs),
		Confidence:          profile.Confidence(p.Confidence),
	}
}

// NewAkilScorePlugin creates a new AKIL Score plugin instance.
func NewAkilScorePlugin(args AkilScoreArgs) (*AkilScorePlugin, error) {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	if args.AggregatorAddress == "" {
		args.AggregatorAddress = "akil-aggregator.akil-system:50051"
	}
	if args.WeightCache == 0 {
		args.WeightCache = 35
	}
	if args.WeightLock == 0 {
		args.WeightLock = 30
	}
	if args.WeightPageFault == 0 {
		args.WeightPageFault = 20
	}
	if args.WeightCtxSwitch == 0 {
		args.WeightCtxSwitch = 15
	}
	if args.QueryTimeoutMs == 0 {
		args.QueryTimeoutMs = 5
	}

	// Connect to aggregator
	conn, err := grpc.NewClient(args.AggregatorAddress,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to aggregator at %s: %w",
			args.AggregatorAddress, err)
	}

	client := pb.NewAkilTelemetryClient(conn)

	scorer := scoring.NewScorer(scoring.ScorerConfig{
		Weights: scoring.Weights{
			Cache:     args.WeightCache,
			Lock:      args.WeightLock,
			PageFault: args.WeightPageFault,
			CtxSwitch: args.WeightCtxSwitch,
		},
	})

	plugin := &AkilScorePlugin{
		client:       client,
		scorer:       scorer,
		queryTimeout: time.Duration(args.QueryTimeoutMs) * time.Millisecond,
		logger:       logger,
	}

	logger.Info("AKIL Score plugin initialized",
		"aggregator_address", args.AggregatorAddress,
		"weights", fmt.Sprintf("cache=%v lock=%v pf=%v cs=%v",
			args.WeightCache, args.WeightLock, args.WeightPageFault, args.WeightCtxSwitch),
		"query_timeout", plugin.queryTimeout,
	)

	return plugin, nil
}

var (
	aggregatorAddr = flag.String("aggregator-addr", "akil-aggregator.akil-system:50051",
		"Address of the AKIL aggregation service")
)

func main() {
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	logger.Info("AKIL Scheduler Plugin",
		"note", "This binary requires Kubernetes Scheduling Framework integration.",
		"usage", "Build as part of a custom kube-scheduler. See deploy/helm/ for configuration.",
	)

	// Create plugin instance (validates aggregator connectivity)
	plugin, err := NewAkilScorePlugin(AkilScoreArgs{
		AggregatorAddress: *aggregatorAddr,
	})
	if err != nil {
		logger.Error("failed to create plugin", "error", err)
		os.Exit(1)
	}

	// Example: score a workload on a node
	ctx := context.Background()
	score, reason, err := plugin.Score(ctx, "default/Deployment/example", "node-1")
	if err != nil {
		logger.Error("scoring failed", "error", err)
		os.Exit(1)
	}

	logger.Info("example score",
		"score", score,
		"reason", reason,
	)
}
