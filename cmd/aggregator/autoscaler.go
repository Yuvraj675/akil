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
	autoscalingEnabled bool = true
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

func startAutoscalerLoop(ctx context.Context, store *profile.Store, client *kubernetes.Clientset, logger *slog.Logger) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !getAutoscaling() {
				continue
			}
			
			// Iterate over all active profiles
			keys := store.Keys()

			if client == nil {
				currentReplicas := getReplicas()
				newReplicas := currentReplicas
				var reason string

				for _, k := range keys {
					prof := store.QueryProfile(k)
					if prof.ContextSwitchRate > 100 {
						newReplicas++
						reason = "High Context Switch Rate detected (>100/s) for " + k + ". Scaling UP to relieve CPU contention."
						break
					} else if prof.PageFaultRate > 5000 {
						newReplicas++
						reason = "High Page Fault Rate detected (>5000/s) for " + k + ". Scaling UP to distribute memory pressure."
						break
					} else if prof.CacheMissRate > 1000 {
						newReplicas++
						reason = "High Cache Miss Rate detected (>1000/s) for " + k + ". Scaling UP to improve cache locality."
						break
					} else if prof.ContextSwitchRate < 50 && prof.PageFaultRate < 2000 && prof.CacheMissRate < 500 && currentReplicas > 1 {
						newReplicas--
						reason = "Metrics nominal for " + k + ". Scaling DOWN to conserve resources."
						break
					}
				}

				if newReplicas > 6 {
					newReplicas = 6
				}
				if newReplicas < 1 {
					newReplicas = 1
				}

				if newReplicas != currentReplicas {
					setReplicas(newReplicas)
					autoMu.Lock()
					scalingLogs = append(scalingLogs, ScalingLog{
						Timestamp: time.Now().Format(time.RFC3339),
						Action:    map[bool]string{true: "SCALE UP", false: "SCALE DOWN"}[newReplicas > currentReplicas],
						Reason:    reason,
						Replicas:  newReplicas,
					})
					if len(scalingLogs) > 50 {
						scalingLogs = scalingLogs[1:]
					}
					autoMu.Unlock()
				}
				continue
			}
			
			// Track processed deployments to avoid scaling multiple times for different pods of same deployment
			processedDeployments := make(map[string]bool)

			for _, k := range keys {
				prof := store.QueryProfile(k)
				
				// Parse workload key. Example: "default/ReplicaSet/demo-workload-7cb4c48f" or "demo-workload"
				deploymentName := k
				if strings.Contains(k, "/") {
					slashParts := strings.Split(k, "/")
					if len(slashParts) == 3 {
						namePart := slashParts[2]
						// namePart is like demo-workload-7cb4c48f
						dashParts := strings.Split(namePart, "-")
						if len(dashParts) >= 2 {
							// For replicasets, the last part is the pod-template-hash. We drop it to get the deployment name.
							deploymentName = strings.Join(dashParts[:len(dashParts)-1], "-")
						} else {
							deploymentName = namePart
						}
					}
				} else {
					// Fallback for simple keys like "demo-workload" sent by UI directly
					parts := strings.Split(k, "-")
					if len(parts) >= 3 {
						deploymentName = strings.Join(parts[:len(parts)-2], "-")
					}
				}

				if processedDeployments[deploymentName] {
					continue
				}
				
				// Try to get scale for derived name
				scale, err := client.AppsV1().Deployments("default").GetScale(ctx, deploymentName, metav1.GetOptions{})
				if err != nil {
					// Fallback to exact key
					scale, err = client.AppsV1().Deployments("default").GetScale(ctx, k, metav1.GetOptions{})
					if err != nil {
						continue // Not a deployment or not found
					}
					deploymentName = k
				}
				
				processedDeployments[deploymentName] = true

				currentReplicas := scale.Spec.Replicas
				newReplicas := currentReplicas
				var reason string
				
				if prof.ContextSwitchRate > 100 {
					newReplicas++
					reason = "High Context Switch Rate detected (>100/s) for " + deploymentName + ". Scaling UP to relieve CPU contention."
				} else if prof.PageFaultRate > 5000 {
					newReplicas++
					reason = "High Page Fault Rate detected (>5000/s) for " + deploymentName + ". Scaling UP to distribute memory pressure."
				} else if prof.CacheMissRate > 1000 {
					newReplicas++
					reason = "High Cache Miss Rate detected (>1000/s) for " + deploymentName + ". Scaling UP to improve cache locality."
				} else if prof.ContextSwitchRate < 50 && prof.PageFaultRate < 2000 && prof.CacheMissRate < 500 {
					newReplicas--
					reason = "Metrics nominal for " + deploymentName + ". Scaling DOWN to conserve resources."
				}
				
				if newReplicas > 5 {
					newReplicas = 5
				}
				if newReplicas < 1 {
					newReplicas = 1
				}
				
				if newReplicas != currentReplicas {
					logger.Info("autoscaler acting on telemetry", "deployment", deploymentName, "old", currentReplicas, "new", newReplicas, "reason", reason)
					
					autoMu.Lock()
					scalingLogs = append(scalingLogs, ScalingLog{
						Timestamp: time.Now().Format(time.RFC3339),
						Action:    map[bool]string{true: "SCALE UP", false: "SCALE DOWN"}[newReplicas > currentReplicas],
						Reason:    reason,
						Replicas:  newReplicas,
					})
					if len(scalingLogs) > 50 {
						scalingLogs = scalingLogs[1:]
					}
					autoMu.Unlock()

					scale.Spec.Replicas = newReplicas
					client.AppsV1().Deployments("default").UpdateScale(ctx, deploymentName, scale, metav1.UpdateOptions{})
				}
			}
		}
	}
}
