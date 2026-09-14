// Package telemetry defines shared types for kernel telemetry events
// and the pipeline that processes them from eBPF ring buffers to gRPC streams.
package telemetry

import "fmt"

// EventType discriminates kernel event types in the shared ring buffer.
type EventType uint8

const (
	EventPageFault      EventType = 0
	EventCacheMiss      EventType = 1
	EventLockContention EventType = 2
	EventCtxSwitch      EventType = 3
)

func (e EventType) String() string {
	switch e {
	case EventPageFault:
		return "page_fault"
	case EventCacheMiss:
		return "cache_miss"
	case EventLockContention:
		return "lock_contention"
	case EventCtxSwitch:
		return "ctx_switch"
	default:
		return fmt.Sprintf("unknown(%d)", e)
	}
}

// RawEvent is the Go representation of the BPF ring buffer event struct.
// It mirrors the C struct layout defined in pkg/ebpf/akil.c.
//
//	struct akil_event {
//	    __u8  event_type;
//	    __u64 cgroup_id;
//	    __u64 timestamp_ns;
//	    union { ... per-type fields };
//	};
type RawEvent struct {
	Type        EventType
	CgroupID    uint64
	TimestampNs uint64
	Payload     EventPayload
}

// EventPayload is a union-like interface for per-event-type data.
type EventPayload interface {
	eventPayload() // marker method
}

// PageFaultPayload holds data from page fault tracepoints.
type PageFaultPayload struct {
	IsMajor bool   // true = major fault (disk I/O), false = minor
	Address uint64 // faulting virtual address
}

func (PageFaultPayload) eventPayload() {}

// CacheMissPayload holds data from hardware perf counter samples.
type CacheMissPayload struct {
	MissCountDelta uint64 // number of LLC misses since last sample
}

func (CacheMissPayload) eventPayload() {}

// LockContentionPayload holds data from lock contention tracepoints.
type LockContentionPayload struct {
	LockAddress uint64 // address of the contended lock
	DurationNs  int64  // time spent waiting (contention_end - contention_begin)
}

func (LockContentionPayload) eventPayload() {}

// CtxSwitchPayload holds data from sched_switch tracepoints.
type CtxSwitchPayload struct {
	PrevCgroupID uint64 // cgroup of the task being switched out
	NextCgroupID uint64 // cgroup of the task being switched in
	PrevState    int32  // task state of the outgoing process
}

func (CtxSwitchPayload) eventPayload() {}

// PodIdentity maps a kernel cgroup ID to Kubernetes pod metadata.
type PodIdentity struct {
	Namespace   string // e.g., "default"
	PodName     string // e.g., "web-frontend-5d4b8c7f9-x2k4j"
	Container   string // e.g., "nginx"
	WorkloadKey string // owner reference — e.g., "default/Deployment/web-frontend"
	NodeName    string // node this pod runs on
}

// TaggedEvent is a RawEvent that has been resolved to a PodIdentity.
type TaggedEvent struct {
	RawEvent
	Identity PodIdentity
}
