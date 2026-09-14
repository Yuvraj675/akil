// +build ignore

// This file contains the eBPF C programs for AKIL kernel telemetry collection.
// It is compiled by bpf2go at build time to generate Go bindings.
//
// Four probes share a single BPF ring buffer:
//   1. Page fault  — tracepoint/exceptions/page_fault_user, page_fault_kernel
//   2. Cache miss  — perf_event (PERF_COUNT_HW_CACHE_MISSES)
//   3. Lock contention — tracepoint/lock/contention_begin, contention_end
//   4. Context switch — tracepoint/sched/sched_switch

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

#define EVENT_PAGE_FAULT      0
#define EVENT_CACHE_MISS      1
#define EVENT_LOCK_CONTENTION 2
#define EVENT_CTX_SWITCH      3

#define RINGBUF_SIZE (16 * 1024 * 1024)  // 16 MB
#define MAX_LOCK_ENTRIES 65536

// ---------------------------------------------------------------------------
// Event structure — shared across all probes
// ---------------------------------------------------------------------------

struct akil_event {
    __u8  event_type;
    __u64 cgroup_id;
    __u64 timestamp_ns;

    // Per-type payload (union)
    union {
        // PAGE_FAULT
        struct {
            __u8  is_major;    // 1 = major, 0 = minor
            __u64 address;
        } page_fault;

        // CACHE_MISS
        struct {
            __u64 miss_count_delta;
        } cache_miss;

        // LOCK_CONTENTION
        struct {
            __u64 lock_addr;
            __s64 duration_ns;
        } lock_contention;

        // CTX_SWITCH
        struct {
            __u64 prev_cgroup_id;
            __u64 next_cgroup_id;
            __s32 prev_state;
        } ctx_switch;
    };
};

// ---------------------------------------------------------------------------
// Lock tracking key for contention_begin/end correlation
// ---------------------------------------------------------------------------

struct lock_key {
    __u64 cgroup_id;
    __u64 lock_addr;
};

struct lock_val {
    __u64 start_ns;
};

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

// Shared ring buffer for all events — read by user-space collector.
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, RINGBUF_SIZE);
} events SEC(".maps");

// Internal hash map for tracking lock contention begin timestamps.
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_LOCK_ENTRIES);
    __type(key, struct lock_key);
    __type(value, struct lock_val);
} lock_starts SEC(".maps");

// ---------------------------------------------------------------------------
// Helper: get current task's cgroup ID
// ---------------------------------------------------------------------------

static __always_inline __u64 get_current_cgroup_id(void)
{
    return bpf_get_current_cgroup_id();
}

// ---------------------------------------------------------------------------
// Probe 1: Page Fault
// ---------------------------------------------------------------------------

// Tracepoint format for exceptions/page_fault_user and page_fault_kernel:
//   unsigned long address;
//   unsigned long ip;
//   unsigned long error_code;

SEC("tracepoint/exceptions/page_fault_user")
int akil_page_fault_user(struct trace_event_raw_page_fault_user *ctx)
{
    struct akil_event *evt;

    evt = bpf_ringbuf_reserve(&events, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->event_type = EVENT_PAGE_FAULT;
    evt->cgroup_id = get_current_cgroup_id();
    evt->timestamp_ns = bpf_ktime_get_ns();
    evt->page_fault.is_major = 0;  // user-space faults are typically minor
    evt->page_fault.address = BPF_CORE_READ(ctx, address);

    bpf_ringbuf_submit(evt, 0);
    return 0;
}

SEC("tracepoint/exceptions/page_fault_kernel")
int akil_page_fault_kernel(struct trace_event_raw_page_fault_kernel *ctx)
{
    struct akil_event *evt;

    evt = bpf_ringbuf_reserve(&events, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->event_type = EVENT_PAGE_FAULT;
    evt->cgroup_id = get_current_cgroup_id();
    evt->timestamp_ns = bpf_ktime_get_ns();
    evt->page_fault.is_major = 1;  // kernel faults are more likely major
    evt->page_fault.address = BPF_CORE_READ(ctx, address);

    bpf_ringbuf_submit(evt, 0);
    return 0;
}

// ---------------------------------------------------------------------------
// Probe 2: Cache Miss (perf event)
// ---------------------------------------------------------------------------

// This program is attached to a perf_event for PERF_COUNT_HW_CACHE_MISSES.
// It fires once every N cache misses (configurable sample period).

SEC("perf_event")
int akil_cache_miss(struct bpf_perf_event_data *ctx)
{
    struct akil_event *evt;

    evt = bpf_ringbuf_reserve(&events, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->event_type = EVENT_CACHE_MISS;
    evt->cgroup_id = get_current_cgroup_id();
    evt->timestamp_ns = bpf_ktime_get_ns();
    evt->cache_miss.miss_count_delta = 1;  // each sample = N misses (period)

    bpf_ringbuf_submit(evt, 0);
    return 0;
}

// ---------------------------------------------------------------------------
// Probe 3: Lock Contention
// ---------------------------------------------------------------------------

// tracepoint/lock/contention_begin fires when a task starts waiting on a lock.
// We record the start time, keyed by (cgroup_id, lock_address).

SEC("tracepoint/lock/contention_begin")
int akil_lock_contention_begin(struct trace_event_raw_contention_begin *ctx)
{
    struct lock_key key = {};
    struct lock_val val = {};

    key.cgroup_id = get_current_cgroup_id();
    key.lock_addr = BPF_CORE_READ(ctx, lock_start);

    val.start_ns = bpf_ktime_get_ns();

    bpf_map_update_elem(&lock_starts, &key, &val, BPF_ANY);
    return 0;
}

// tracepoint/lock/contention_end fires when the task acquires the lock.
// We compute duration and emit an event.

SEC("tracepoint/lock/contention_end")
int akil_lock_contention_end(struct trace_event_raw_contention_end *ctx)
{
    struct lock_key key = {};
    struct lock_val *val;
    struct akil_event *evt;
    __u64 now;

    key.cgroup_id = get_current_cgroup_id();
    key.lock_addr = BPF_CORE_READ(ctx, lock_start);

    val = bpf_map_lookup_elem(&lock_starts, &key);
    if (!val)
        return 0;

    now = bpf_ktime_get_ns();

    evt = bpf_ringbuf_reserve(&events, sizeof(*evt), 0);
    if (!evt) {
        bpf_map_delete_elem(&lock_starts, &key);
        return 0;
    }

    evt->event_type = EVENT_LOCK_CONTENTION;
    evt->cgroup_id = key.cgroup_id;
    evt->timestamp_ns = now;
    evt->lock_contention.lock_addr = key.lock_addr;
    evt->lock_contention.duration_ns = (__s64)(now - val->start_ns);

    bpf_ringbuf_submit(evt, 0);
    bpf_map_delete_elem(&lock_starts, &key);
    return 0;
}

// ---------------------------------------------------------------------------
// Probe 4: Context Switch
// ---------------------------------------------------------------------------

// tracepoint/sched/sched_switch provides prev and next task information.
// We capture both cgroup IDs to track which workloads are being switched.

SEC("tracepoint/sched/sched_switch")
int akil_sched_switch(struct trace_event_raw_sched_switch *ctx)
{
    struct akil_event *evt;

    evt = bpf_ringbuf_reserve(&events, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->event_type = EVENT_CTX_SWITCH;
    evt->cgroup_id = get_current_cgroup_id();
    evt->timestamp_ns = bpf_ktime_get_ns();
    evt->ctx_switch.prev_cgroup_id = get_current_cgroup_id();
    // Note: next task's cgroup ID requires reading from the next task struct.
    // For simplicity in Phase 1, we record only the outgoing task's cgroup.
    evt->ctx_switch.next_cgroup_id = 0;
    evt->ctx_switch.prev_state = BPF_CORE_READ(ctx, prev_state);

    bpf_ringbuf_submit(evt, 0);
    return 0;
}

char _license[] SEC("license") = "GPL";
