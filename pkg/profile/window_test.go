package profile

import (
	"testing"
	"time"
)

func TestWorkloadProfile_RecordAndCompute(t *testing.T) {
	wp := NewWorkloadProfile("default/Deployment/test", 12, 5*time.Second)

	// Record some events
	for i := 0; i < 50; i++ {
		wp.RecordPageFault("node-1")
		wp.RecordCacheMiss(100, "node-1")
		wp.RecordLockContention(1000000, "node-1") // 1ms
		wp.RecordCtxSwitch("node-1")
	}

	p := wp.ComputeProfile()

	if p.WorkloadKey != "default/Deployment/test" {
		t.Errorf("workload key mismatch: %s", p.WorkloadKey)
	}
	if p.SampleCount != 200 { // 4 types × 50 events
		t.Errorf("expected 200 events, got %d", p.SampleCount)
	}
	if p.PageFaultRate <= 0 {
		t.Error("page fault rate should be > 0")
	}
	if p.CacheMissRate <= 0 {
		t.Error("cache miss rate should be > 0")
	}
	if p.LockContentionRatio <= 0 {
		t.Error("lock contention ratio should be > 0")
	}
	if p.ContextSwitchRate <= 0 {
		t.Error("context switch rate should be > 0")
	}
	if p.Confidence != ConfidenceMedium {
		t.Errorf("expected MEDIUM confidence with 200 samples, got %s", p.Confidence)
	}

	t.Logf("Profile: pf=%.2f/s cache=%.2f/s lock=%.6f cs=%.2f/s confidence=%s",
		p.PageFaultRate, p.CacheMissRate, p.LockContentionRatio, p.ContextSwitchRate, p.Confidence)
}

func TestWorkloadProfile_ConfidenceLevels(t *testing.T) {
	tests := []struct {
		name     string
		events   int
		expected Confidence
	}{
		{"no events", 0, ConfidenceUnknown},
		{"few events", 50, ConfidenceLow},
		{"moderate events", 500, ConfidenceMedium},
		{"many events", 2000, ConfidenceHigh},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wp := NewWorkloadProfile("test", 12, 5*time.Second)
			for i := 0; i < tt.events; i++ {
				wp.RecordPageFault("node-1")
			}
			p := wp.ComputeProfile()
			if p.Confidence != tt.expected {
				t.Errorf("expected %s confidence with %d events, got %s",
					tt.expected, tt.events, p.Confidence)
			}
		})
	}
}

func TestWorkloadProfile_NodeLocations(t *testing.T) {
	wp := NewWorkloadProfile("default/Deployment/multi-node", 12, 5*time.Second)

	wp.RecordPageFault("node-1")
	wp.RecordPageFault("node-2")
	wp.RecordCacheMiss(100, "node-3")
	wp.RecordPageFault("node-1") // duplicate

	nodes := wp.NodeLocations()
	if len(nodes) != 3 {
		t.Errorf("expected 3 unique nodes, got %d: %v", len(nodes), nodes)
	}
}

func TestStore_GetOrCreate(t *testing.T) {
	store := NewStore(12, 5*time.Second)

	p1 := store.GetOrCreate("default/Deployment/app-1")
	p2 := store.GetOrCreate("default/Deployment/app-1") // same key

	if p1 != p2 {
		t.Error("GetOrCreate should return the same profile for the same key")
	}

	p3 := store.GetOrCreate("default/Deployment/app-2")
	if p1 == p3 {
		t.Error("different keys should produce different profiles")
	}

	if store.ActiveProfiles() != 2 {
		t.Errorf("expected 2 active profiles, got %d", store.ActiveProfiles())
	}
}

func TestStore_QueryNodeProfiles(t *testing.T) {
	store := NewStore(12, 5*time.Second)

	// Create profiles on different nodes
	wp1 := store.GetOrCreate("default/Deployment/app-1")
	wp1.RecordPageFault("node-1")

	wp2 := store.GetOrCreate("default/Deployment/app-2")
	wp2.RecordPageFault("node-1")
	wp2.RecordPageFault("node-2")

	wp3 := store.GetOrCreate("default/Deployment/app-3")
	wp3.RecordPageFault("node-2")

	// Query node-1: should find app-1 and app-2
	profiles := store.QueryNodeProfiles("node-1")
	if len(profiles) != 2 {
		t.Errorf("expected 2 profiles on node-1, got %d", len(profiles))
	}

	// Query node-2: should find app-2 and app-3
	profiles = store.QueryNodeProfiles("node-2")
	if len(profiles) != 2 {
		t.Errorf("expected 2 profiles on node-2, got %d", len(profiles))
	}

	// Query non-existent node
	profiles = store.QueryNodeProfiles("node-999")
	if len(profiles) != 0 {
		t.Errorf("expected 0 profiles on non-existent node, got %d", len(profiles))
	}
}

func TestStore_QueryProfile_NotFound(t *testing.T) {
	store := NewStore(12, 5*time.Second)

	p := store.QueryProfile("nonexistent")
	if p.Confidence != ConfidenceUnknown {
		t.Errorf("non-existent profile should have UNKNOWN confidence, got %s", p.Confidence)
	}
	if p.WorkloadKey != "nonexistent" {
		t.Errorf("workload key should be preserved, got %s", p.WorkloadKey)
	}
}

func TestBucket_Reset(t *testing.T) {
	b := Bucket{
		EventCount:     100,
		PageFaults:     50,
		CacheMisses:    200,
		LockDurationNs: 5000000,
		CtxSwitches:    30,
	}

	now := time.Now()
	b.Reset(now)

	if b.EventCount != 0 || b.PageFaults != 0 || b.CacheMisses != 0 ||
		b.LockDurationNs != 0 || b.CtxSwitches != 0 {
		t.Error("bucket should be zeroed after reset")
	}
	if !b.StartTime.Equal(now) {
		t.Error("bucket start time should be updated after reset")
	}
}
