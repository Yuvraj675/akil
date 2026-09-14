package telemetry

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// CgroupResolver maps kernel cgroup IDs to Kubernetes PodIdentity.
// It uses a three-step resolution chain:
//  1. cgroupfs walk — map cgroup ID to cgroup path
//  2. Path parsing — extract container ID from cgroup path
//  3. Kubelet API — map container ID to pod metadata
//
// An LRU cache (TTL-based) avoids repeated lookups.
type CgroupResolver struct {
	mu sync.RWMutex

	// cache maps cgroup_id -> cached PodIdentity with expiry
	cache map[uint64]cachedIdentity

	// kubeletURL is the local kubelet pods API endpoint
	kubeletURL string

	// nodeName is the name of the node this resolver runs on
	nodeName string

	// cacheTTL is how long a cache entry is valid
	cacheTTL time.Duration

	// cgroupBasePath is the root of the cgroup filesystem
	cgroupBasePath string

	logger     *slog.Logger
	httpClient *http.Client
}

type cachedIdentity struct {
	identity PodIdentity
	expiry   time.Time
}

// CgroupResolverConfig configures the cgroup resolver.
type CgroupResolverConfig struct {
	// KubeletURL is the local kubelet API endpoint.
	// Default: "https://localhost:10250"
	KubeletURL string

	// NodeName is this node's name (from Kubernetes downward API).
	NodeName string

	// CacheTTL is how long resolved identities are cached.
	// Default: 30s
	CacheTTL time.Duration

	// CgroupBasePath is the root of the cgroup filesystem.
	// Default: "/sys/fs/cgroup"
	CgroupBasePath string

	Logger *slog.Logger
}

// DefaultCgroupResolverConfig returns a config with sensible defaults.
func DefaultCgroupResolverConfig() CgroupResolverConfig {
	return CgroupResolverConfig{
		KubeletURL:     "https://localhost:10250",
		CacheTTL:       30 * time.Second,
		CgroupBasePath: "/sys/fs/cgroup",
		Logger:         slog.Default(),
	}
}

// NewCgroupResolver creates a new resolver.
func NewCgroupResolver(cfg CgroupResolverConfig) *CgroupResolver {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.CacheTTL == 0 {
		cfg.CacheTTL = 30 * time.Second
	}
	if cfg.CgroupBasePath == "" {
		cfg.CgroupBasePath = "/sys/fs/cgroup"
	}

	return &CgroupResolver{
		cache:          make(map[uint64]cachedIdentity),
		kubeletURL:     cfg.KubeletURL,
		nodeName:       cfg.NodeName,
		cacheTTL:       cfg.CacheTTL,
		cgroupBasePath: cfg.CgroupBasePath,
		logger:         cfg.Logger,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// Resolve maps a cgroup ID to a PodIdentity.
// Returns an error if the cgroup cannot be resolved.
func (r *CgroupResolver) Resolve(cgroupID uint64) (PodIdentity, error) {
	// Step 1: Check cache
	r.mu.RLock()
	cached, ok := r.cache[cgroupID]
	r.mu.RUnlock()

	if ok && time.Now().Before(cached.expiry) {
		return cached.identity, nil
	}

	// Step 2: Resolve cgroup ID to cgroup path
	cgroupPath, err := r.resolveCgroupPath(cgroupID)
	if err != nil {
		return PodIdentity{}, fmt.Errorf("resolve cgroup path for ID %d: %w", cgroupID, err)
	}

	// Step 3: Parse container ID from cgroup path
	containerID, err := parseContainerID(cgroupPath)
	if err != nil {
		return PodIdentity{}, fmt.Errorf("parse container ID from %q: %w", cgroupPath, err)
	}

	// Step 4: Query kubelet for pod metadata
	identity, err := r.queryKubelet(containerID)
	if err != nil {
		return PodIdentity{}, fmt.Errorf("query kubelet for container %q: %w", containerID, err)
	}

	identity.NodeName = r.nodeName

	// Step 5: Cache the result
	r.mu.Lock()
	r.cache[cgroupID] = cachedIdentity{
		identity: identity,
		expiry:   time.Now().Add(r.cacheTTL),
	}
	r.mu.Unlock()

	return identity, nil
}

// resolveCgroupPath walks the cgroupfs to find the path for a given cgroup ID.
func (r *CgroupResolver) resolveCgroupPath(cgroupID uint64) (string, error) {
	// Read /proc/self/cgroup or walk /sys/fs/cgroup to find the mapping.
	// For cgroup v2, we can read the cgroup.controllers file to find the path.
	//
	// A more efficient approach: read /proc/<pid>/cgroup for any process in the cgroup.
	// Since we have the cgroup ID, we can scan /sys/fs/cgroup/**/cgroup.stat
	// for matching IDs.
	//
	// For production use, a more efficient approach would be to use the
	// bpf_cgroup_get_current_cgroup_id() helper and maintain an inotify-based
	// watcher on /sys/fs/cgroup.

	// Walk /sys/fs/cgroup looking for the cgroup ID
	var foundPath string
	err := filepath.Walk(r.cgroupBasePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip errors
		}
		if info.Name() != "cgroup.stat" {
			return nil
		}

		// Read cgroup.stat to check if this cgroup matches our ID
		dir := filepath.Dir(path)
		id, readErr := readCgroupID(dir)
		if readErr != nil {
			return nil
		}
		if id == cgroupID {
			foundPath = dir
			return filepath.SkipAll
		}
		return nil
	})

	if err != nil {
		return "", fmt.Errorf("walk cgroup filesystem: %w", err)
	}
	if foundPath == "" {
		return "", fmt.Errorf("cgroup ID %d not found", cgroupID)
	}

	return foundPath, nil
}

// readCgroupID reads the cgroup ID for a given cgroup directory.
// On cgroup v2, this is available via the cgroup.id file or can be
// obtained via statx() on the directory.
func readCgroupID(cgroupDir string) (uint64, error) {
	// Try reading cgroup.id (available on newer kernels)
	data, err := os.ReadFile(filepath.Join(cgroupDir, "cgroup.id"))
	if err == nil {
		var id uint64
		if _, scanErr := fmt.Sscanf(strings.TrimSpace(string(data)), "%d", &id); scanErr == nil {
			return id, nil
		}
	}

	// Fallback: use name_to_handle_at or statx to get the cgroup ID
	// This is a simplified version — production code would use syscalls.
	return 0, fmt.Errorf("cannot read cgroup ID from %s", cgroupDir)
}

// parseContainerID extracts the container ID from a cgroup path.
// Supports both containerd and CRI-O cgroup path formats.
//
// containerd (cgroup v2):
//
//	/sys/fs/cgroup/system.slice/containerd.service/kubepods-besteffort-pod<uid>.slice/<container-id>
//
// CRI-O:
//
//	/sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/crio-<container-id>.scope
func parseContainerID(cgroupPath string) (string, error) {
	parts := strings.Split(cgroupPath, "/")
	if len(parts) == 0 {
		return "", fmt.Errorf("empty cgroup path")
	}

	// Get the last component
	last := parts[len(parts)-1]

	// CRI-O format: crio-<id>.scope
	if strings.HasPrefix(last, "crio-") && strings.HasSuffix(last, ".scope") {
		id := strings.TrimPrefix(last, "crio-")
		id = strings.TrimSuffix(id, ".scope")
		return id, nil
	}

	// containerd format: the container ID is the last path component
	// (a 64-character hex string)
	if len(last) == 64 && isHex(last) {
		return last, nil
	}

	// containerd with scope suffix
	if strings.HasSuffix(last, ".scope") {
		trimmed := strings.TrimSuffix(last, ".scope")
		// Extract after last dash
		if idx := strings.LastIndex(trimmed, "-"); idx >= 0 {
			candidate := trimmed[idx+1:]
			if len(candidate) >= 12 && isHex(candidate) {
				return candidate, nil
			}
		}
	}

	return "", fmt.Errorf("cannot parse container ID from cgroup path component %q", last)
}

func isHex(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// kubeletPodList is the minimal structure for parsing the kubelet /pods response.
type kubeletPodList struct {
	Items []kubeletPod `json:"items"`
}

type kubeletPod struct {
	Metadata kubeletMeta        `json:"metadata"`
	Status   kubeletPodStatus   `json:"status"`
}

type kubeletMeta struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace"`
	OwnerReferences []kubeletOwnerRef `json:"ownerReferences"`
}

type kubeletOwnerRef struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type kubeletPodStatus struct {
	ContainerStatuses []kubeletContainerStatus `json:"containerStatuses"`
}

type kubeletContainerStatus struct {
	Name        string `json:"name"`
	ContainerID string `json:"containerID"` // e.g., "containerd://abc123..."
}

// queryKubelet queries the local kubelet API to resolve a container ID to pod metadata.
func (r *CgroupResolver) queryKubelet(containerID string) (PodIdentity, error) {
	// In production, this would query the kubelet's /pods endpoint.
	// For local development or testing, we also support reading from
	// a cached pod list file.

	resp, err := r.httpClient.Get(r.kubeletURL + "/pods")
	if err != nil {
		return PodIdentity{}, fmt.Errorf("kubelet request failed: %w", err)
	}
	defer resp.Body.Close()

	var podList kubeletPodList
	if err := json.NewDecoder(bufio.NewReader(resp.Body)).Decode(&podList); err != nil {
		return PodIdentity{}, fmt.Errorf("decode kubelet response: %w", err)
	}

	return findPodByContainerID(podList, containerID)
}

// findPodByContainerID searches the pod list for a pod containing the given container ID.
func findPodByContainerID(podList kubeletPodList, containerID string) (PodIdentity, error) {
	for _, pod := range podList.Items {
		for _, cs := range pod.Status.ContainerStatuses {
			// Container ID format: "containerd://abc123..." or "cri-o://abc123..."
			parts := strings.SplitN(cs.ContainerID, "://", 2)
			var csID string
			if len(parts) == 2 {
				csID = parts[1]
			} else {
				csID = cs.ContainerID
			}

			if csID == containerID || strings.HasPrefix(csID, containerID) {
				identity := PodIdentity{
					Namespace: pod.Metadata.Namespace,
					PodName:   pod.Metadata.Name,
					Container: cs.Name,
				}

				// Derive workload key from owner references
				if len(pod.Metadata.OwnerReferences) > 0 {
					owner := pod.Metadata.OwnerReferences[0]
					// For ReplicaSets, the actual owner is the Deployment
					// (ReplicaSet name = deployment-name-<hash>)
					ownerKind := owner.Kind
					ownerName := owner.Name
					if ownerKind == "ReplicaSet" {
						// Strip the ReplicaSet hash to get the Deployment name
						if idx := strings.LastIndex(ownerName, "-"); idx > 0 {
							ownerName = ownerName[:idx]
						}
						ownerKind = "Deployment"
					}
					identity.WorkloadKey = fmt.Sprintf("%s/%s/%s",
						pod.Metadata.Namespace, ownerKind, ownerName)
				} else {
					// Standalone pod
					identity.WorkloadKey = fmt.Sprintf("%s/Pod/%s",
						pod.Metadata.Namespace, pod.Metadata.Name)
				}

				return identity, nil
			}
		}
	}

	return PodIdentity{}, fmt.Errorf("container %q not found in kubelet pod list", containerID)
}

// CacheStats returns current cache statistics.
func (r *CgroupResolver) CacheStats() (size int, hitRatio float64) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.cache), 0 // TODO: track hits/misses
}

// EvictExpired removes expired entries from the cache.
func (r *CgroupResolver) EvictExpired() int {
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()

	evicted := 0
	for id, cached := range r.cache {
		if now.After(cached.expiry) {
			delete(r.cache, id)
			evicted++
		}
	}
	return evicted
}
