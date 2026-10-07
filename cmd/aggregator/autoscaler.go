package main

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"github.com/Yuvraj675/akil/pkg/profile"
)

type ScalingLog struct {
	Timestamp string  `json:"timestamp"`
	Action    string  `json:"action"`
	Reason    string  `json:"reason"`
	Replicas  int32   `json:"replicas"`
}

var (
	autoscalingEnabled bool
	autoMu             sync.Mutex
	scalingLogs        []ScalingLog
)

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

func startAutoscalerLoop(ctx context.Context, store *profile.Store, client *kubernetes.Clientset, logger *slog.Logger) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !getAutoscaling() || client == nil {
				continue
			}
			
			// Find demo-workload profile
			keys := store.Keys()
			var targetKey string
			for _, k := range keys {
				if strings.Contains(k, "demo-workload") {
					targetKey = k
					break
				}
			}
			
			if targetKey == "" {
				continue
			}
			
			prof := store.QueryProfile(targetKey)
			
			// Get current scale
			scale, err := client.AppsV1().Deployments("default").GetScale(ctx, "demo-workload", metav1.GetOptions{})
			if err != nil {
				logger.Error("autoscaler failed to get scale", "err", err)
				continue
			}
			
			currentReplicas := scale.Spec.Replicas
			newReplicas := currentReplicas
			var reason string
			
			// Logic: High context switches (> 100/s) or high page faults (> 5000/s) implies noisy neighbor interference.
			if prof.ContextSwitchRate > 100 {
				newReplicas++
				reason = "High Context Switch Rate detected (>100/s). Scaling UP to relieve CPU contention."
			} else if prof.PageFaultRate > 5000 {
				newReplicas++
				reason = "High Page Fault Rate detected (>5000/s). Scaling UP to distribute memory pressure."
			} else if prof.CacheMissRate > 1000 {
				newReplicas++
				reason = "High Cache Miss Rate detected (>1000/s). Scaling UP to improve cache locality."
			} else if prof.ContextSwitchRate < 50 && prof.PageFaultRate < 2000 && prof.CacheMissRate < 500 {
				newReplicas--
				reason = "Metrics nominal. Scaling DOWN to conserve resources."
			}
			
			if newReplicas > 5 {
				newReplicas = 5
				reason = "Max replicas (5) reached."
			}
			if newReplicas < 1 {
				newReplicas = 1
				reason = "Min replicas (1) reached."
			}
			
			if newReplicas != currentReplicas {
				logger.Info("autoscaler acting on telemetry", "old", currentReplicas, "new", newReplicas, "reason", reason)
				
				autoMu.Lock()
				scalingLogs = append(scalingLogs, ScalingLog{
					Timestamp: time.Now().Format(time.RFC3339),
					Action:    map[bool]string{true: "SCALE UP", false: "SCALE DOWN"}[newReplicas > currentReplicas],
					Reason:    reason,
					Replicas:  newReplicas,
				})
				// Keep only last 50 logs
				if len(scalingLogs) > 50 {
					scalingLogs = scalingLogs[1:]
				}
				autoMu.Unlock()

				scale.Spec.Replicas = newReplicas
				client.AppsV1().Deployments("default").UpdateScale(ctx, "demo-workload", scale, metav1.UpdateOptions{})
			}
		}
	}
}
