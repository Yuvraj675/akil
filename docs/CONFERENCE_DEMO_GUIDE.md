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

1. **Dashboard Tab**: Select **Conference Demo** $\to$ **1. The Blind Spot**.
2. **Action**: Click the **"Cache Thrashing (stress-ng)"** scenario button.
3. **What to Say to the Audience**:
   > *"Modern container schedulers like `kube-scheduler` place pods based purely on static resource requests—CPU cores and memory bytes. But they have a critical blind spot: they cannot see microarchitectural behavior inside the OS kernel.*
   >
   > *Here on screen, Worker Node 1 is hosting a cache-thrashing noisy neighbor executing random memory traversals. When our latency-sensitive web service arrives requesting only 100 millicores of CPU, default Kubernetes co-locates them on Node 1 because it has plenty of free CPU quota. Look at what happens to our p99 tail latency: it blows up from 17 ms to 63.1 ms, violating our SLO by over 300%!"*

---

### Phase 2: eBPF Telemetry & Sliding-Window Ingest (Minute 1:00 – 2:15)

1. **Dashboard Tab**: Click **2. eBPF Telemetry** in the demo stepper.
2. **What to Show**:
   - Point to the live metrics on the node cards (LLC miss rate: $850,000/\text{s}$, lock contention ratio, page faults, context switches).
   - Point to the header badge: `eBPF: 4 Probes | CO-RE v5.8+`.
3. **What to Say to the Audience**:
   > *"AKIL solves this by attaching four lightweight eBPF probes directly to hardware performance counters and kernel tracepoints in Linux: LLC cache misses, mutex contention duration, page faults, and context switches.*
   >
   > *Using CO-RE (Compile Once, Run Everywhere), these probes run without kernel modules or application modifications. Events are written to a single 16 MB shared ring buffer, resolved to Kubernetes pod identities via cgroups, and streamed over gRPC into an in-memory 60-second sliding-window profile store. Total CPU overhead is under 0.35% of one core."*

---

### Phase 3: Live Closed-Loop Scheduling Decision (Minute 2:15 – 3:30)

1. **Dashboard Tab**: Click **3. AKIL Placement**.
2. **Action**: In the bottom box, select `Candidate: baseline-web (Latency Critical)` and click **"Run Score & Bind Pod"**.
3. **What Happens Live on Screen**:
   - The plugin evaluates all nodes.
   - **Worker Node 1** (has cache thrashing): Computes pairwise cache interference $\min(\dot{m}_c, \dot{m}_i) \to$ **Score drops to 24 (REJECTED)**.
   - **Worker Node 3** (clean node): **Score reaches 94 (ACCEPTED)**.
   - Pod is bound to Node 3 $\to$ Green badge *"Pod Bound Here"* appears!
   - Live p99 tail latency drops immediately back to **20.4 ms** (SLO Preserved).
4. **What to Say to the Audience**:
   > *"When our web service is scheduled, the AKIL Score plugin executes synchronously inside the Kubernetes Scheduling Framework. It queries candidate and resident profiles via unary gRPC in under 320 microseconds.*
   >
   > *Notice the mathematical term: $\min(\dot{m}_c, \dot{m}_i)$. By taking the minimum rather than the sum, AKIL specifically penalizes mutual destructive interference where cache-heavy workloads evict a latency-sensitive tenant's cache lines. Node 1 is penalized with a score of 24, while clean Node 3 scores 94. The pod binds to Node 3, and our p99 tail latency is preserved under 15 ms."*

---

### Phase 4: Fail-Open Resilience & Graceful Degradation (Minute 3:30 – 4:15)

1. **Dashboard Tab**: Click **4. Fail-Open Safe**.
2. **Action**: In the scenario bar, click the button **"SIMULATE OFFLINE"** (Aggregator gRPC).
3. **What Happens Live on Screen**:
   - The Aggregator status switches to red: `OFFLINE`.
   - Node scores immediately return to **50 / 100** (Neutral Score).
   - Status text: *"Fail-Open: Aggregator offline (Neutral score returned in 0.08ms. Zero scheduler blocking!)"*
4. **What to Say to the Audience**:
   > *"A custom scheduler plugin must never block cluster operations. If the AKIL aggregation service becomes unreachable, network packets drop, or a query exceeds the 5ms timeout, AKIL guarantees graceful degradation. The plugin instantly returns a neutral score of 50. Standard Kubernetes scheduling proceeds at 100% throughput without delay."*

---

### Phase 5: Empirical Paper Evidence & Multi-Baseline Comparison (Minute 4:15 – 5:00)

1. **Dashboard Tab**: Click **"Paper Evidence"** in the top navigation bar.
2. **What to Show**:
   - **Tail Latency CDF Curve**: Show that AKIL's curve hugs the isolated clean oracle, whereas Default K8s and the Reactive Descheduler stretch far into the tail.
   - **Comparative Table**: Point to the 95% Confidence Interval table matching Table IV in your paper.
3. **What to Say to the Audience**:
   > *"Here are our empirical results across 10 randomized evaluation trials on a 5-node cluster:*
   > - *Compared to default Kubernetes, AKIL reduces LLC cache misses by 33.0% and p99 tail latency by 67.7%.*
   > - *Compared to static PodAntiAffinity, AKIL achieves identical latency protection without wasting node capacity or causing pod fragmentation.*
   > - *Compared to reactive deschedulers, AKIL eliminates eviction storms and container restart churn.*
   > - *All of this is achieved with only 0.31 ms added to the scheduling cycle, well below the 5 ms budget.*
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
