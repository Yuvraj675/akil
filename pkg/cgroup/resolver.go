package cgroup

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"log/slog"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type Resolver struct {
	client   *kubernetes.Clientset
	nodeName string
	logger   *slog.Logger
	cgroupMap map[uint64]string
	mu       sync.RWMutex
}

func NewResolver(nodeName string) (*Resolver, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("in-cluster config failed: %w", err)
	}
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("clientset failed: %w", err)
	}

	return &Resolver{
		client:    clientset,
		nodeName:  nodeName,
		logger:    slog.Default().With("component", "cgroup-resolver"),
		cgroupMap: make(map[uint64]string),
	}, nil
}

func (r *Resolver) Start(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	r.sync(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.sync(ctx)
		}
	}
}

func (r *Resolver) sync(ctx context.Context) {
	pods, err := r.client.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + r.nodeName,
	})
	if err != nil {
		r.logger.Error("failed to list pods", "err", err)
		return
	}

	newMap := make(map[uint64]string)

	for _, pod := range pods.Items {
		workloadKey := getWorkloadKey(&pod)
		
		for _, cs := range pod.Status.ContainerStatuses {
			parts := strings.Split(cs.ContainerID, "://")
			if len(parts) != 2 {
				continue
			}
			cID := parts[1]
			cgroupPath := findCgroupPath(cID)
			if cgroupPath != "" {
				var stat syscall.Stat_t
				if err := syscall.Stat(cgroupPath, &stat); err == nil {
					newMap[stat.Ino] = workloadKey
				}
			}
		}
	}

	r.mu.Lock()
	r.cgroupMap = newMap
	r.mu.Unlock()
	r.logger.Debug("synced cgroup map", "entries", len(newMap))
}

func (r *Resolver) Resolve(cgroupID uint64) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.cgroupMap[cgroupID]
}

func getWorkloadKey(pod *corev1.Pod) string {
	if len(pod.OwnerReferences) > 0 {
		ref := pod.OwnerReferences[0]
		return fmt.Sprintf("%s/%s/%s", pod.Namespace, ref.Kind, ref.Name)
	}
	return fmt.Sprintf("%s/Pod/%s", pod.Namespace, pod.Name)
}

func findCgroupPath(containerID string) string {
	baseDir := "/sys/fs/cgroup"
	targetPath := ""
	filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil { return nil }
		if info.IsDir() && strings.Contains(path, containerID) {
			targetPath = path
			return filepath.SkipDir
		}
		return nil
	})
	return targetPath
}
