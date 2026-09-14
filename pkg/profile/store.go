package profile

import (
	"sync"
	"time"
)

// Store is a concurrent-safe store of workload profiles.
// It maps workload keys to their sliding-window WorkloadProfiles.
type Store struct {
	profiles sync.Map // map[string]*WorkloadProfile

	bucketCount    int
	bucketDuration time.Duration
}

// NewStore creates a new profile store with the given window configuration.
func NewStore(bucketCount int, bucketDuration time.Duration) *Store {
	if bucketCount <= 0 {
		bucketCount = DefaultBucketCount
	}
	if bucketDuration <= 0 {
		bucketDuration = DefaultBucketDuration
	}
	return &Store{
		bucketCount:    bucketCount,
		bucketDuration: bucketDuration,
	}
}

// GetOrCreate returns the WorkloadProfile for the given key, creating one if it doesn't exist.
func (s *Store) GetOrCreate(workloadKey string) *WorkloadProfile {
	if existing, ok := s.profiles.Load(workloadKey); ok {
		return existing.(*WorkloadProfile)
	}

	newProfile := NewWorkloadProfile(workloadKey, s.bucketCount, s.bucketDuration)
	actual, _ := s.profiles.LoadOrStore(workloadKey, newProfile)
	return actual.(*WorkloadProfile)
}

// Get returns the WorkloadProfile for the given key, or nil if it doesn't exist.
func (s *Store) Get(workloadKey string) *WorkloadProfile {
	if existing, ok := s.profiles.Load(workloadKey); ok {
		return existing.(*WorkloadProfile)
	}
	return nil
}

// QueryProfile returns the computed RuntimeProfile for a workload.
// Returns a zero-value profile with ConfidenceUnknown if the workload is not found.
func (s *Store) QueryProfile(workloadKey string) RuntimeProfile {
	wp := s.Get(workloadKey)
	if wp == nil {
		return RuntimeProfile{
			WorkloadKey: workloadKey,
			Confidence:  ConfidenceUnknown,
		}
	}
	return wp.ComputeProfile()
}

// QueryNodeProfiles returns all workload profiles that have pods on the given node.
func (s *Store) QueryNodeProfiles(nodeName string) []RuntimeProfile {
	var profiles []RuntimeProfile

	s.profiles.Range(func(key, value any) bool {
		wp := value.(*WorkloadProfile)
		nodes := wp.NodeLocations()
		for _, n := range nodes {
			if n == nodeName {
				profiles = append(profiles, wp.ComputeProfile())
				break
			}
		}
		return true
	})

	return profiles
}

// ActiveProfiles returns the count of profiles currently in the store.
func (s *Store) ActiveProfiles() int {
	count := 0
	s.profiles.Range(func(_, _ any) bool {
		count++
		return true
	})
	return count
}

// Delete removes a workload profile from the store.
func (s *Store) Delete(workloadKey string) {
	s.profiles.Delete(workloadKey)
}

// Keys returns all workload keys in the store.
func (s *Store) Keys() []string {
	var keys []string
	s.profiles.Range(func(key, _ any) bool {
		keys = append(keys, key.(string))
		return true
	})
	return keys
}
