# AKIL: Conference Live Demo & Presentation Guide

This guide provides a structured, minute-by-minute walkthrough for presenting **AKIL** at an academic or industry systems conference (e.g., IEEE Cloud, EuroSys, USENIX, ACM SoCC).

---

## 1. Quick Launch (30 Seconds Before Presentation)

In your terminal, launch the system backend and dashboard:

```bash
cd /home/yuvraj/Documents/Code_Projects/akil
./start-all.sh
```

Open your browser to:
**`http://localhost:5173`**

The dashboard will open directly to the **Conference Demo** cockpit with live telemetry and cluster health indicators active.

---

## 2. The 5-Minute Scripted Conference Presentation

```
[00:00 - 01:00] The Blind Spot (Default Kubernetes Scheduling)
[01:00 - 02:15] Layer 1 & 2: eBPF Telemetry Ingest & Sliding Window Store
[02:15 - 03:30] Layer 3 & 4: Live AKIL Closed-Loop Scheduling Decision
[03:30 - 04:15] Fail-Open Resilience & Zero Scheduler Blocking
[04:15 - 05:00] Empirical Paper Evidence & Multi-Baseline Benchmarks
```

---

### Phase 1: The Blind Spot of Modern Schedulers (Minute 0:00 – 1:00)

1. **Dashboard Tab**: Select **Overview & Flow**.
2. **Action**: In the right panel, select **CLUSTER SCENARIO** $\to$ **Cache Thrashing (Node 1 Contended)** and choose **CANDIDATE POD** $\to$ **baseline-web**.
3. **What to Say to the Audience**:
   > *"Modern container schedulers like `kube-scheduler` place pods based purely on static resource requests—CPU cores and memory bytes. But they have a critical blind spot: they cannot see microarchitectural behavior inside the OS kernel.*
   >
   > *Here on screen, Worker Node 1 is hosting a cache-thrashing noisy neighbor executing random memory traversals. When our latency-sensitive web service arrives requesting only 100 millicores of CPU, default Kubernetes co-locates them on Node 1 because it has plenty of free CPU quota. Look at what happens to our p99 tail latency in the live telemetry graph: it blows up from 17.5 ms to 63.1 ms, violating our 15ms SLO deadline!"*

---

### Phase 2: System Anatomy & Closed-Loop eBPF Architecture (Minute 1:00 – 2:15)

1. **Dashboard Tab**: Scroll down on **Overview & Flow** to the **Anatomy of the Closed-Loop Pipeline** (or click the **System Anatomy** tab).
2. **What to Show**:
   - Point to the 4 layers:
     1. **Kernel Probes (Layer 01)**: eBPF attached to `PERF_COUNT_HW_CACHE_MISSES`, mutex contention, page faults, and context switches.
     2. **Collector Daemon (Layer 02)**: Pure Go DaemonSet draining the 16MB ring buffer and resolving cgroups to pod identities via Kubelet API.
     3. **Sliding-Window Aggregator (Layer 03)**: In-memory circular buffer (12 buckets $\times$ 5s) computing continuous behavioral rates within 320 microseconds.
     4. **Scheduler Plugin (Layer 04)**: Kubernetes Scheduling Framework `Score` extension point calculating pairwise interference penalties.
3. **What to Say to the Audience**:
   > *"AKIL bridges this gap by continuously extracting four low-overhead kernel signals per cgroup, buffering them in lock-free ring buffers, and aggregating them into sub-millisecond queryable profiles without modifying application code or patching the kernel."*

---

### Phase 3: Live Scheduling Evaluation & Penalty Calculation (Minute 2:15 – 3:30)

1. **Dashboard Tab**: In **Overview & Flow**, click **"Re-evaluate Score()"** (or switch to **Scorer Sandbox** to adjust weights).
2. **What Happens Live on Screen**:
   - The plugin evaluates all nodes using formula III-D:
     - **Worker Node 1** (has cache-stress): Pairwise cache penalty applied $\to$ **Score: 24 (REJECTED)**.
     - **Worker Node 3** (clean node): Minimal interference $\to$ **Score: 94 (SELECTED)**.
   - The live latency graph demonstrates that isolating the workload on Node 3 stabilizes tail latency at **20.4 ms** (SLO Preserved).
3. **What to Say to the Audience**:
   > *"When our web service is scheduled, the AKIL Score plugin executes synchronously in under 320 microseconds. Notice the mathematical formulation: $\min(\dot{m}_c, \dot{m}_i)$. By taking the minimum rather than the sum, AKIL penalizes mutual destructive interference where cache-heavy workloads evict a latency-sensitive tenant's cache lines. Node 1 receives a heavy penalty and scores 24, while clean Node 3 scores 94. The pod binds to Node 3, preserving our SLO."*

---

### Phase 4: Live Telemetry Streams & Adaptive Autoscaling (Minute 3:30 – 4:15)

1. **Dashboard Tab**: Click **Live Telemetry** in the navigation bar.
2. **What to Show**:
   - Live streaming graphs of Page Faults, Cache Misses, Mutex Contention Ratio, and Context Switches streaming directly from the Go aggregator (:50051).
   - Point to the **Adaptive Autoscaling Engine Logs** panel on the right.
3. **What to Say to the Audience**:
   > *"AKIL also couples kernel telemetry into an adaptive autoscaler loop. When sudden memory leaks or mutex contention storms are detected, AKIL scales out replicas to distribute pressure across nodes before OOM kills occur."*

---

### Phase 5: Empirical Benchmark Evidence & Multi-Baseline Comparison (Minute 4:15 – 5:00)

1. **Dashboard Tab**: Click **Evaluation Data** in the top navigation bar.
2. **What to Show**:
   - **Tail Latency CDF Curve**: Show that AKIL's curve hugs the isolated clean oracle, whereas Default K8s and the Reactive Descheduler stretch far into the tail.
   - **Comparative Matrix**: Point to Table IV with 95% Confidence Intervals.
3. **What to Say to the Audience**:
   > *"Here are our empirical results across 10 randomized evaluation trials on a 5-node cluster:*
   > - *Compared to default Kubernetes, AKIL reduces LLC cache misses by 33.0% and p99 tail latency by 67.7%.*
   > - *Compared to static PodAntiAffinity, AKIL achieves identical latency protection without node fragmentation or wasted capacity.*
   > - *Compared to reactive deschedulers, AKIL eliminates eviction storms and container restart churn.*
   > - *All of this is achieved with only 0.31 ms added to the scheduling cycle, well below the 5 ms budget.*
   >
   > *Thank you, and I am happy to take questions."*
   >
   > *Thank you, and I am happy to take questions."*

---

## 3. Anticipated Questions from Conference Reviewers

| Likely Question | Your Answer |
|---|---|
| *"Why not just use static PodAntiAffinity rules?"* | Anti-affinity is static and binary. In loaded clusters, it causes **node fragmentation**—leaving pods in `Pending` state even when nodes have plenty of capacity. AKIL is continuous and graceful, adjusting placement dynamically without manual annotations. |
| *"Why not use a reactive descheduler?"* | Reactive descheduling reacts *after* performance degrades, causing **eviction storms, dropped TCP connections, and cold-cache restarts**. In our benchmarks, the descheduler caused 92 pod evictions, while AKIL prevented interference proactively with zero evictions. |
| *"What is the CPU overhead of eBPF?"* | Measured at **0.35% of one CPU core** per node. Tracepoint hooks are filtered by cgroup ID at the kernel level, and batching flushes only once every 1,000 events or 1 second. |
| *"What happens with new workloads that have no history?"* | Workloads with low sample counts have their penalties dampened by **0.25×**, and unknown workloads receive a neutral score (50). Profiles reach medium confidence within $\approx 8$ seconds of pod startup. |
