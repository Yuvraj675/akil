package main

import (
	"context"
	"github.com/Yuvraj675/akil/pkg/profile"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"log/slog"
	"os"
	"sync"
	"time"
)

type ScalingLog struct {
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	Reason    string `json:"reason"`
	Replicas  int32  `json:"replicas"`
}

var (
	// Off by default: it adds replicas of any noisy deployment, which can exhaust
	// memory on a laptop-sized cluster. Enable from the UI or with AKIL_AUTOSCALE=1.
	autoscalingEnabled bool = os.Getenv("AKIL_AUTOSCALE") == "1"
	autoMu             sync.Mutex
	scalingLogs        []ScalingLog
	simulatedReplicas  int32 = 2
)

func setReplicas(n int32) {
	autoMu.Lock()
	defer autoMu.Unlock()
	simulatedReplicas = n
}

func getReplicas() int32 {
	autoMu.Lock()
	defer autoMu.Unlock()
	return simulatedReplicas
}

func setAutoscaling(enabled bool) {
	autoMu.Lock()
	defer autoMu.Unlock()
	autoscalingEnabled = enabled
	scalingLogs = append(scalingLogs, ScalingLog{
		Timestamp: time.Now().Format(time.RFC3339),
		Action:    "INFO",
		Reason:    "Adaptive Autoscaling Toggled: " + map[bool]string{true: "ON", false: "OFF"}[enabled],
		Replicas:  -1,
	})
}

func getAutoscaling() bool {
	autoMu.Lock()
	defer autoMu.Unlock()
	return autoscalingEnabled
}

func getScalingLogs() []ScalingLog {
	autoMu.Lock()
	defer autoMu.Unlock()
	// Return a copy to avoid race conditions
	logs := make([]ScalingLog, len(scalingLogs))
	copy(logs, scalingLogs)
	return logs
}

// simulatedKeys are the workloads the demo UI feeds through /api/simulate-events.
// In a cluster the autoscaler decides on these, not on real telemetry, which
// always contains some hot workload (the stress pods) and would never scale down.
var simulatedKeys sync.Map

func markSimulated(key string) { simulatedKeys.Store(key, struct{}{}) }

// decide applies the demo's rule: add a replica while any workload is hot,
// remove one once all are nominal (an idle or drained profile counts as nominal).
func decide(store *profile.Store, keys []string, current int32) (int32, string) {
	if len(keys) == 0 {
		return current, ""
	}
	allNominal := true
	for _, k := range keys {
		prof := store.QueryProfile(k)
		switch {
		case prof.ContextSwitchRate > 100:
			return min(current+1, maxReplicas), "High Context Switch Rate detected (>100/s) for " + k + ". Scaling UP to relieve CPU contention."
		case prof.PageFaultRate > 5000:
			return min(current+1, maxReplicas), "High Page Fault Rate detected (>5000/s) for " + k + ". Scaling UP to distribute memory pressure."
		case prof.CacheMissRate > 1000:
			return min(current+1, maxReplicas), "High Cache Miss Rate detected (>1000/s) for " + k + ". Scaling UP to improve cache locality."
		}
		if !(prof.ContextSwitchRate < 50 && prof.PageFaultRate < 2000 && prof.CacheMissRate < 500) {
			allNominal = false
		}
	}
	if allNominal && current > 1 {
		return current - 1, "All workload metrics nominal. Scaling DOWN to conserve resources."
	}
	return current, ""
}

const maxReplicas = 6

// demoDeployment is the deployment /api/scale reports and the autoscaler scales.
const demoDeployment = "demo-workload"

func logScaling(old, n int32, reason string) {
	autoMu.Lock()
	defer autoMu.Unlock()
	scalingLogs = append(scalingLogs, ScalingLog{
		Timestamp: time.Now().Format(time.RFC3339),
		Action:    map[bool]string{true: "SCALE UP", false: "SCALE DOWN"}[n > old],
		Reason:    reason,
		Replicas:  n,
	})
	if len(scalingLogs) > 50 {
		scalingLogs = scalingLogs[1:]
	}
}

func startAutoscalerLoop(ctx context.Context, store *profile.Store, client *kubernetes.Clientset, logger *slog.Logger) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		if !getAutoscaling() {
			continue
		}

		if client == nil {
			cur := getReplicas()
			if n, reason := decide(store, store.Keys(), cur); n != cur {
				setReplicas(n)
				logScaling(cur, n, reason)
			}
			continue
		}

		var keys []string
		simulatedKeys.Range(func(k, _ any) bool { keys = append(keys, k.(string)); return true })
		if len(keys) == 0 {
			continue
		}
		// Only a deployment that opts in is scaled, so a noisy neighbour is never cloned.
		d, err := client.AppsV1().Deployments("default").Get(ctx, demoDeployment, metav1.GetOptions{})
		if err != nil || d.Labels["akil.io/autoscale"] != "true" {
			continue
		}
		scale, err := client.AppsV1().Deployments("default").GetScale(ctx, demoDeployment, metav1.GetOptions{})
		if err != nil {
			continue
		}
		cur := scale.Spec.Replicas
		n, reason := decide(store, keys, cur)
		if n == cur {
			continue
		}
		scale.Spec.Replicas = n
		if _, err := client.AppsV1().Deployments("default").UpdateScale(ctx, demoDeployment, scale, metav1.UpdateOptions{}); err != nil {
			logger.Warn("autoscaler update failed", "deployment", demoDeployment, "err", err)
			continue
		}
		logger.Info("autoscaler acting on telemetry", "deployment", demoDeployment, "old", cur, "new", n, "reason", reason)
		logScaling(cur, n, reason)
	}
}
