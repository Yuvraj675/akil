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
