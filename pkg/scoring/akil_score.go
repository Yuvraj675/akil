package scoring

import (
	"context"
	"encoding/json"
	"fmt"
	"google.golang.org/grpc/connectivity"
	"log/slog"
	"strings"
	"time"

	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/kubernetes/pkg/scheduler/framework"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/Yuvraj675/akil/pkg/profile"
	pb "github.com/Yuvraj675/akil/pkg/proto"
)

const Name = "AkilScore"

// defaultQueryTimeout bounds each aggregator call so a slow aggregator degrades to a
// neutral score instead of stalling the scheduling cycle (Goal G3).
const defaultQueryTimeout = 5 * time.Millisecond

// Args is the pluginConfig args block for AkilScore in KubeSchedulerConfiguration.
type Args struct {
	AggregatorAddress string `json:"aggregatorAddress"`
	// QueryTimeoutMs overrides defaultQueryTimeout. Nodes are scored in parallel, so
	// under heavy ingest the queued queries can need more than 5 ms.
	QueryTimeoutMs int `json:"queryTimeoutMs"`
}

type AkilScorePlugin struct {
	client  pb.AkilTelemetryClient
	timeout time.Duration
	scorer  *Scorer
	logger  *slog.Logger
}

var _ framework.ScorePlugin = &AkilScorePlugin{}

func New(_ context.Context, obj runtime.Object, _ framework.Handle) (framework.Plugin, error) {
	args := Args{AggregatorAddress: "localhost:50051"}
	if u, ok := obj.(*runtime.Unknown); ok && u != nil && len(u.Raw) > 0 {
		if err := json.Unmarshal(u.Raw, &args); err != nil {
			return nil, fmt.Errorf("decode AkilScore args: %w", err)
		}
	}

	conn, err := grpc.NewClient(args.AggregatorAddress, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to dial aggregator: %w", err)
	}
	// Connect now so the first Score() call doesn't spend its 5 ms budget on DNS and
	// the handshake. If the aggregator is down we start anyway and score neutral.
	conn.Connect()
	wctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	for st := conn.GetState(); st != connectivity.Ready && conn.WaitForStateChange(wctx, st); st = conn.GetState() {
	}
	cancel()

	timeout := defaultQueryTimeout
	if args.QueryTimeoutMs > 0 {
		timeout = time.Duration(args.QueryTimeoutMs) * time.Millisecond
	}
	return &AkilScorePlugin{
		client:  pb.NewAkilTelemetryClient(conn),
		timeout: timeout,
		scorer:  NewScorer(DefaultScorerConfig()),
		logger:  slog.Default(),
	}, nil
}

func (p *AkilScorePlugin) Name() string {
	return Name
}

func (p *AkilScorePlugin) Score(ctx context.Context, _ *framework.CycleState, pod *v1.Pod, nodeName string) (int64, *framework.Status) {
	workloadKey := getWorkloadKey(pod)

	qctx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()

	cand, err := p.client.QueryProfile(qctx, &pb.ProfileRequest{WorkloadKey: workloadKey})
	if err != nil {
		p.logger.Warn("candidate profile query failed, returning neutral", "workload", workloadKey, "err", err)
		return NeutralScore, nil
	}

	nodeResp, err := p.client.QueryNodeProfiles(qctx, &pb.NodeProfilesRequest{NodeName: nodeName})
	if err != nil {
		p.logger.Warn("node profiles query failed, returning neutral", "node", nodeName, "err", err)
		return NeutralScore, nil
	}

	colocated := make([]profile.RuntimeProfile, 0, len(nodeResp.Profiles))
	for _, np := range nodeResp.Profiles {
		if np.WorkloadKey == workloadKey {
			continue // the candidate's own replicas are not its neighbours' interference
		}
		if strings.Contains(np.WorkloadKey, "/DaemonSet/") {
			continue // runs on every node (including AKIL's own collector), so it can't tell nodes apart
		}
		colocated = append(colocated, fromProto(np))
	}

	res := p.scorer.Score(fromProto(cand), colocated)
	p.logger.Info("AKIL score", "pod", pod.Name, "node", nodeName, "score", res.Score, "reason", res.Reason)
	return res.Score, nil
}

func (p *AkilScorePlugin) ScoreExtensions() framework.ScoreExtensions {
	return nil
}

func fromProto(r *pb.RuntimeProfile) profile.RuntimeProfile {
	return profile.RuntimeProfile{
		WorkloadKey:         r.WorkloadKey,
		PageFaultRate:       r.PageFaultRate,
		CacheMissRate:       r.CacheMissRate,
		LockContentionRatio: r.LockContentionRatio,
		ContextSwitchRate:   r.ContextSwitchRate,
		SampleCount:         r.SampleCount,
		Confidence:          profile.Confidence(r.Confidence),
	}
}

// getWorkloadKey must match the collector's key (pkg/cgroup/resolver.go).
func getWorkloadKey(pod *v1.Pod) string {
	if len(pod.OwnerReferences) > 0 {
		ref := pod.OwnerReferences[0]
		return fmt.Sprintf("%s/%s/%s", pod.Namespace, ref.Kind, ref.Name)
	}
	return fmt.Sprintf("%s/Pod/%s", pod.Namespace, pod.Name)
}
