// Package profile implements the sliding-window aggregation layer for AKIL.
// It maintains per-workload runtime profiles computed from kernel telemetry events.
package profile

import (
	"sync"
	"time"
)

const (
	// DefaultBucketCount is the number of time buckets in the sliding window.
	DefaultBucketCount = 12

	// DefaultBucketDuration is the duration of each time bucket.
	DefaultBucketDuration = 5 * time.Second

	// DefaultWindowDuration = BucketCount * BucketDuration = 60s
)

// Bucket holds aggregated telemetry counts for a single time window.
type Bucket struct {
	EventCount     int64
	PageFaults     int64
	CacheMisses    int64
	LockDurationNs int64
	CtxSwitches    int64
	StartTime      time.Time
}

// Reset clears all counters in the bucket and sets a new start time.
func (b *Bucket) Reset(startTime time.Time) {
	b.EventCount = 0
	b.PageFaults = 0
	b.CacheMisses = 0
	b.LockDurationNs = 0
	b.CtxSwitches = 0
	b.StartTime = startTime
}

// Confidence represents the statistical reliability of a runtime profile.
type Confidence int

const (
	ConfidenceUnknown Confidence = 0
	ConfidenceLow     Confidence = 1 // < 100 samples
	ConfidenceMedium  Confidence = 2 // 100–1000 samples
	ConfidenceHigh    Confidence = 3 // > 1000 samples
)

// String returns the string representation of a Confidence level.
func (c Confidence) String() string {
	switch c {
	case ConfidenceLow:
		return "LOW"
	case ConfidenceMedium:
		return "MEDIUM"
	case ConfidenceHigh:
		return "HIGH"
	default:
		return "UNKNOWN"
	}
}

// RuntimeProfile is the computed output of the sliding window aggregation.
// It represents a workload's kernel-level runtime behavior over the window period.
type RuntimeProfile struct {
	WorkloadKey          string
	PageFaultRate        float64    // faults/sec
	CacheMissRate        float64    // misses/sec
	LockContentionRatio  float64    // fraction of time in contention [0.0, 1.0]
	ContextSwitchRate    float64    // switches/sec
	SampleCount          int64      // total events in window
	WindowStart          time.Time
	WindowEnd            time.Time
	Confidence           Confidence
}

// WorkloadProfile maintains the sliding window state for a single workload.
type WorkloadProfile struct {
	mu sync.RWMutex

	workloadKey    string
	buckets        []Bucket
	bucketCount    int
	bucketDuration time.Duration
	currentIdx     int
	lastRotation   time.Time

	// nodeLocations tracks which nodes this workload has pods on
	nodeLocations map[string]struct{}
}

// NewWorkloadProfile creates a new sliding window profile for a workload.
func NewWorkloadProfile(workloadKey string, bucketCount int, bucketDuration time.Duration) *WorkloadProfile {
	if bucketCount <= 0 {
		bucketCount = DefaultBucketCount
	}
	if bucketDuration <= 0 {
		bucketDuration = DefaultBucketDuration
	}

	now := time.Now()
	buckets := make([]Bucket, bucketCount)
	for i := range buckets {
		buckets[i].StartTime = now
	}

	return &WorkloadProfile{
		workloadKey:    workloadKey,
		buckets:        buckets,
		bucketCount:    bucketCount,
		bucketDuration: bucketDuration,
		currentIdx:     0,
		lastRotation:   now,
		nodeLocations:  make(map[string]struct{}),
	}
}

// RecordPageFault adds a page fault event to the current bucket.
func (wp *WorkloadProfile) RecordPageFault(nodeName string) {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	wp.maybeRotate()
	wp.buckets[wp.currentIdx].PageFaults++
	wp.buckets[wp.currentIdx].EventCount++
	wp.nodeLocations[nodeName] = struct{}{}
}

// RecordCacheMiss adds a cache miss event to the current bucket.
func (wp *WorkloadProfile) RecordCacheMiss(delta int64, nodeName string) {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	wp.maybeRotate()
	wp.buckets[wp.currentIdx].CacheMisses += delta
	wp.buckets[wp.currentIdx].EventCount++
	wp.nodeLocations[nodeName] = struct{}{}
}

// RecordLockContention adds a lock contention event to the current bucket.
func (wp *WorkloadProfile) RecordLockContention(durationNs int64, nodeName string) {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	wp.maybeRotate()
	wp.buckets[wp.currentIdx].LockDurationNs += durationNs
	wp.buckets[wp.currentIdx].EventCount++
	wp.nodeLocations[nodeName] = struct{}{}
}

// RecordCtxSwitch adds a context switch event to the current bucket.
func (wp *WorkloadProfile) RecordCtxSwitch(nodeName string) {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	wp.maybeRotate()
	wp.buckets[wp.currentIdx].CtxSwitches++
	wp.buckets[wp.currentIdx].EventCount++
	wp.nodeLocations[nodeName] = struct{}{}
}

// ComputeProfile computes the RuntimeProfile from all buckets in the window.
func (wp *WorkloadProfile) ComputeProfile() RuntimeProfile {
	wp.mu.RLock()
	defer wp.mu.RUnlock()

	var totalFaults, totalMisses, totalLockNs, totalSwitches, totalEvents int64
	var windowStart, windowEnd time.Time

	for i, b := range wp.buckets {
		totalFaults += b.PageFaults
		totalMisses += b.CacheMisses
		totalLockNs += b.LockDurationNs
		totalSwitches += b.CtxSwitches
		totalEvents += b.EventCount

		if i == 0 || b.StartTime.Before(windowStart) {
			windowStart = b.StartTime
		}
		if b.StartTime.After(windowEnd) {
			windowEnd = b.StartTime.Add(wp.bucketDuration)
		}
	}

	windowDuration := float64(wp.bucketCount) * wp.bucketDuration.Seconds()
	if windowDuration <= 0 {
		windowDuration = 1 // avoid division by zero
	}

	profile := RuntimeProfile{
		WorkloadKey:         wp.workloadKey,
		PageFaultRate:       float64(totalFaults) / windowDuration,
		CacheMissRate:       float64(totalMisses) / windowDuration,
		LockContentionRatio: float64(totalLockNs) / (windowDuration * 1e9),
		ContextSwitchRate:   float64(totalSwitches) / windowDuration,
		SampleCount:         totalEvents,
		WindowStart:         windowStart,
		WindowEnd:           windowEnd,
	}

	// Determine confidence based on sample count
	switch {
	case totalEvents > 1000:
		profile.Confidence = ConfidenceHigh
	case totalEvents >= 100:
		profile.Confidence = ConfidenceMedium
	case totalEvents > 0:
		profile.Confidence = ConfidenceLow
	default:
		profile.Confidence = ConfidenceUnknown
	}

	return profile
}

// NodeLocations returns the set of nodes where this workload has pods.
func (wp *WorkloadProfile) NodeLocations() []string {
	wp.mu.RLock()
	defer wp.mu.RUnlock()

	nodes := make([]string, 0, len(wp.nodeLocations))
	for node := range wp.nodeLocations {
		nodes = append(nodes, node)
	}
	return nodes
}

// maybeRotate checks if the current bucket has expired and rotates if needed.
// Must be called with wp.mu held.
func (wp *WorkloadProfile) maybeRotate() {
	now := time.Now()
	elapsed := now.Sub(wp.lastRotation)

	// How many bucket rotations have we missed?
	rotations := int(elapsed / wp.bucketDuration)
	if rotations <= 0 {
		return
	}

	// Cap rotations at bucketCount (if we've been idle for > window duration,
	// just reset everything)
	if rotations > wp.bucketCount {
		rotations = wp.bucketCount
	}

	for i := 0; i < rotations; i++ {
		wp.currentIdx = (wp.currentIdx + 1) % wp.bucketCount
		wp.buckets[wp.currentIdx].Reset(now)
	}

	wp.lastRotation = now
}
