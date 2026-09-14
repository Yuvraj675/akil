# AKIL — AI Assistant Context

> This file provides structured context for AI coding assistants working in this repository.
> It is not part of the project's deliverables.

---

## Project Identity

- **Full Name**: Adaptive Kernel Intelligence Layer for Runtime-Aware Container Scheduling
- **Acronym**: AKIL
- **One-line Purpose**: A Kubernetes scheduler plugin that uses eBPF-collected kernel telemetry to make placement decisions informed by actual OS-level workload behavior.
- **Context**: Operating Systems course project (August 2026)
- **Phase**: Review 1 complete; implementation pending

---

## Domain Context

This project sits at the intersection of three domains:

1. **Kubernetes Scheduling** — Extending `kube-scheduler` via the Scheduling Framework's `Score` plugin extension point to influence pod-to-node placement.
2. **eBPF Kernel Instrumentation** — Attaching eBPF programs to kernel tracepoints and perf events to observe per-container (per-cgroup) runtime behavior with low overhead.
3. **OS-Level Telemetry** — Collecting and aggregating fine-grained kernel signals that are invisible to Kubernetes' default scheduling inputs.

The project does **NOT** involve machine learning, reinforcement learning, or "AI" in any traditional sense — the name "Intelligence Layer" refers to the system's ability to make *informed* (not *learned*) scheduling decisions.

---

## Architecture — Three Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                          │
│                                                                 │
│  ┌─────────────────────┐         ┌──────────────────────────┐   │
│  │  Per-Node DaemonSet  │         │    Control Plane          │   │
│  │                     │  gRPC   │                          │   │
│  │  ┌───────────────┐  │ stream  │  ┌────────────────────┐  │   │
│  │  │ eBPF Probes   │  │────────▶│  │ Aggregation Service│  │   │
│  │  │ (kernel space) │  │         │  │ (in-memory profiles)│  │   │
│  │  └───────┬───────┘  │         │  └────────┬───────────┘  │   │
│  │          │perf buf   │         │           │ gRPC query   │   │
│  │  ┌───────▼───────┐  │         │  ┌────────▼───────────┐  │   │
│  │  │ Collector     │  │         │  │ Scheduler Plugin   │  │   │
│  │  │ (user space)  │  │         │  │ (Score extension)  │  │   │
│  │  └───────────────┘  │         │  └────────────────────┘  │   │
│  └─────────────────────┘         └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component 1: Telemetry Collector (DaemonSet)

- **Location**: `cmd/collector/`, `pkg/ebpf/`, `pkg/telemetry/`
- **Runs on**: Every node (Kubernetes DaemonSet)
- **Kernel space**: eBPF programs attached to:
  - `tracepoint/exceptions/page_fault_user` and `page_fault_kernel` — page fault rate
  - `perf_event` (hardware counters) — cache miss rate (LLC misses)
  - `tracepoint/lock/contention_begin` / `contention_end` — lock/mutex contention
  - `tracepoint/sched/sched_switch` — context-switch frequency
- **User space**: Reads perf ring buffers, resolves cgroup IDs to pod/container identity, packages telemetry into protobuf messages, streams to aggregation service via gRPC.
- **Key constraint**: Overhead must be negligible — this runs on production nodes alongside real workloads.

### Component 2: Aggregation Service (Deployment)

- **Location**: `cmd/aggregator/`, `pkg/profile/`, `pkg/proto/`
- **Runs as**: Kubernetes Deployment (single replica or leader-elected for HA)
- **Function**: Receives gRPC streams from all node collectors, maintains a **sliding-window runtime profile** per workload (keyed by pod owner — Deployment, StatefulSet, Job).
- **Storage**: In-memory ring buffer per workload. No external database on the hot path.
- **API**: Exposes a gRPC `QueryProfile(workloadID)` method returning the current runtime profile. This is what the scheduler plugin calls.
- **Key constraint**: Query latency must be sub-millisecond — the scheduler has a tight latency budget.

### Component 3: Scheduler Plugin (Score)

- **Location**: `cmd/scheduler-plugin/`, `pkg/scoring/`
- **Runs as**: Part of a custom `kube-scheduler` binary (or as a secondary scheduler)
- **Extension point**: Kubernetes Scheduling Framework — `Score` phase
- **Logic**: For each candidate node, queries the aggregation service for:
  1. The *candidate pod's* workload profile (from previous instances of the same workload)
  2. The *already-running pods'* profiles on that node
- **Scoring**: Penalizes destructive co-location (e.g., two cache-heavy workloads on the same NUMA domain), rewards complementary behavior.
- **Key constraint**: Must degrade gracefully — if the aggregation service is unreachable or no profile exists, the plugin must return a neutral score and not block scheduling.

---

## Kernel Signal Types

These are the four signal classes AKIL collects. When writing eBPF programs or aggregation logic, all four must be handled:

| Signal | Source | What It Indicates |
|---|---|---|
| **Page Fault Rate** | `tracepoint/exceptions/page_fault_*` | Memory pressure, working-set size relative to available memory, swap activity |
| **Cache Miss Rate** | `perf_event` (HW counter: `PERF_COUNT_HW_CACHE_MISSES`) | Cache locality / thrashing potential; high rates indicate workloads that compete for LLC |
| **Lock/Mutex Contention** | `tracepoint/lock/contention_begin/end` | Synchronization overhead; co-locating two contention-heavy workloads amplifies latency |
| **Context-Switch Frequency** | `tracepoint/sched/sched_switch` | CPU-boundedness vs I/O-boundedness; scheduling overhead |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | Go 1.22+ |
| eBPF library | cilium/ebpf (pure Go, CO-RE) |
| eBPF programs | C (restricted kernel C, compiled via clang/llvm) |
| Code generation | bpf2go (cilium/ebpf) |
| Inter-component RPC | gRPC + Protocol Buffers |
| Hot-path storage | In-memory sliding-window ring buffer |
| Observability | Prometheus client_golang (dashboards only, not on scheduler critical path) |
| Build | Go modules + Makefile + Docker multi-stage |
| K8s integration | Kubernetes Scheduling Framework (v1.29+), Score extension point |
| Deployment | Helm 3 charts |
| Local dev cluster | kind (Kubernetes in Docker) |
| Testing | Go testing + testify (unit), kind + e2e (integration) |
| CI | GitHub Actions |

---

## Codebase Conventions

- **Directory layout**: Standard Go project layout — `cmd/` for binaries, `pkg/` for importable packages, `internal/` for non-exported packages, `deploy/` for Helm charts, `hack/` for scripts.
- **Error handling**: Wrap errors with `fmt.Errorf("context: %w", err)`. Never silently swallow errors.
- **Logging**: Use `klog` (Kubernetes standard) in scheduler plugin code. Use `slog` (Go stdlib structured logging) in collector and aggregator.
- **Naming**: Follow Go naming conventions. eBPF C programs use `snake_case`. Proto messages use `CamelCase`.
- **eBPF programs**: All `.c` files in `pkg/ebpf/` are compiled at build time via `bpf2go`. Never load eBPF programs from external files at runtime.
- **gRPC**: Proto files live in `pkg/proto/`. Generated Go code is committed to the repo (no protoc at deploy time).
- **Tests**: Unit tests co-located with source (`_test.go`). Integration tests in `test/e2e/`.

---

## Scope Boundaries — What IS and IS NOT Part of This Phase

### ✅ In Scope

- eBPF-based collection of the four signal types listed above
- Aggregation into per-workload runtime profiles
- A Kubernetes `Score` plugin that uses profiles to adjust node scores
- Synthetic benchmark workloads to demonstrate measurable improvement
- Quantitative evaluation: latency, cache-miss rate, migration/eviction counts
- Documentation of architecture, results, and scoped novelty claim

### ❌ Explicitly Out of Scope

- **Predictive migration** based on trend forecasting (future extension)
- **Reinforcement-learning** policy refinement across deployments (future extension)
- **Energy/thermal-aware** scheduling (future extension)
- **Behavioral-fingerprint-based** security quarantine (future extension)
- **Production hardening** — this is a research/course project, not production-grade software
- **Multi-cluster** scheduling — single cluster only

When generating code or documentation, do **not** include features from the out-of-scope list. They may be mentioned as "future work" but must not be implemented or designed in detail.

---

## Literature Anchors

When describing this project's novelty, use these anchors:

- **Borg/Autopilot** handle resource-usage prediction, not kernel-level behavioral signals → AKIL adds the signal types they don't cover.
- **Firmament** optimizes scheduling formulation, not signal acquisition → AKIL's telemetry could feed a Firmament-style optimizer, but currently uses the simpler Score-plugin approach.
- **Kubernetes Topology Manager** provides NUMA hints for CPU pinning → AKIL adds *dynamic, continuously observed* runtime signals alongside static topology.
- **Cilium/Pixie/Parca** collect eBPF telemetry for observability → AKIL closes the loop by feeding telemetry into a *live scheduling decision*.

The novelty claim is the **combination**: continuous kernel telemetry → aggregation → live scheduler input. Each piece exists independently; the closed loop does not.

---

## Common Pitfalls to Avoid

1. **Do not call this project "AI-powered"** — there is no machine learning. The name "Intelligence Layer" refers to informed decision-making, not artificial intelligence.
2. **Do not overclaim novelty** — the claim is narrow and specific (closed-loop architecture). Individual components are well-established.
3. **Do not put Prometheus on the scheduler's critical path** — Prometheus is for dashboards. The scheduler queries the in-memory aggregation service directly.
4. **Do not use CGo** — the entire userspace is pure Go. eBPF programs are C compiled to `.o` files and loaded via cilium/ebpf.
5. **Do not block scheduling on telemetry** — if the aggregation service is unreachable, the plugin must return a neutral score and let default scheduling proceed.
6. **Do not target specific kernel versions** — use CO-RE (BTF) to ensure portability across kernel 5.8+.
