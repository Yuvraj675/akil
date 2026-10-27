// +build ignore

#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

char __license[] SEC("license") = "Dual MIT/GPL";

// BPF map: Ring buffer to send events to userspace
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24); // 16 MB
} events SEC(".maps");

// Event types must match Go definitions
#define EVENT_TYPE_PAGE_FAULT 1
#define EVENT_TYPE_CACHE_MISS 2
#define EVENT_TYPE_LOCK_CONTENTION 3
#define EVENT_TYPE_CTX_SWITCH 4

// Event structure sent to userspace
struct event_t {
    __u8 event_type;
    __u64 cgroup_id;
    __u64 timestamp_ns;
    union {
        struct {
            __u64 address;
        } page_fault;
        struct {
            __u64 prev_cgroup_id;
            __u64 next_cgroup_id;
        } ctx_switch;
        struct {
            __u64 duration_ns;
        } lock_contention;
        struct {
            __u64 miss_count_delta;
        } cache_miss;
    };
};

// Force emit the struct into BTF for bpf2go
struct event_t *unused_event __attribute__((unused));

SEC("tracepoint/exceptions/page_fault_user")
int handle_page_fault(void *ctx) {
    struct event_t *e;

    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) return 0;

    e->event_type = EVENT_TYPE_PAGE_FAULT;
    e->cgroup_id = bpf_get_current_cgroup_id();
    e->timestamp_ns = bpf_ktime_get_ns();
    
    bpf_ringbuf_submit(e, 0);
    return 0;
}

SEC("tracepoint/sched/sched_switch")
int handle_sched_switch(void *ctx) {
    struct event_t *e;

    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) return 0;

    e->event_type = EVENT_TYPE_CTX_SWITCH;
    e->cgroup_id = bpf_get_current_cgroup_id();
    e->timestamp_ns = bpf_ktime_get_ns();
    
    bpf_ringbuf_submit(e, 0);
    return 0;
}

// Sample period for the cache-miss perf event; set by the loader before load.
volatile const __u64 cache_miss_sample_period = 10000;

// Fires once every cache_miss_sample_period LLC misses on a CPU (perf_event
// PERF_COUNT_HW_CACHE_MISSES) and charges them to the cgroup running at that moment.
SEC("perf_event")
int handle_cache_miss(void *ctx) {
    struct event_t *e;

    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) return 0;

    e->event_type = EVENT_TYPE_CACHE_MISS;
    e->cgroup_id = bpf_get_current_cgroup_id();
    e->timestamp_ns = bpf_ktime_get_ns();
    e->cache_miss.miss_count_delta = cache_miss_sample_period;

    bpf_ringbuf_submit(e, 0);
    return 0;
}

// Contention start time per thread (a thread waits on at most one lock at a time).
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 65536);
    __type(key, __u64);   // pid_tgid
    __type(value, __u64); // start timestamp
} lock_starts SEC(".maps");

SEC("tracepoint/lock/contention_begin")
int handle_contention_begin(void *ctx) {
    __u64 id = bpf_get_current_pid_tgid();
    __u64 ts = bpf_ktime_get_ns();
    bpf_map_update_elem(&lock_starts, &id, &ts, BPF_ANY);
    return 0;
}

SEC("tracepoint/lock/contention_end")
int handle_contention_end(void *ctx) {
    __u64 id = bpf_get_current_pid_tgid();
    __u64 *start = bpf_map_lookup_elem(&lock_starts, &id);
    if (!start) return 0;

    __u64 now = bpf_ktime_get_ns();
    __u64 duration = now - *start;
    bpf_map_delete_elem(&lock_starts, &id);

    struct event_t *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) return 0;

    e->event_type = EVENT_TYPE_LOCK_CONTENTION;
    e->cgroup_id = bpf_get_current_cgroup_id();
    e->timestamp_ns = now;
    e->lock_contention.duration_ns = duration;

    bpf_ringbuf_submit(e, 0);
    return 0;
}
