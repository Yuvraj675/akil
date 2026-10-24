# AKIL: live demo and presentation guide

## Before you present

```bash
make demo        # aggregator on :8080 (12 × 1 s window) + frontend on http://localhost:5173
```

Open http://localhost:5173. A green "Live" line at the top of chapter 2 means the real Go aggregator is processing the telemetry. If you see a yellow note instead, the same algorithms are running in the browser and the demo still works. Arrow keys or a clicker move between chapters.

## The talk, about 5 minutes

**1. The problem (≈1 min).** Two pods with identical CPU and memory requests have completely different kernel behaviour. Kubernetes only sees the requests. Key line: *"The scheduler decides with less information than the kernel already has."*

**2. Live demo (≈2.5 min).** Follow the script panel on the left; it highlights the next step.
1. *Start workloads.* batch-etl and log-shipper appear on node-2 and node-3, and their signal bars fill as the window fills.
2. *Schedule web-frontend.* Both schedulers agree. AKIL stays out of the way when there's nothing to avoid.
3. *Start cache-stress* on node-1. Point out that it requests only 0.1 cores, so node-1 still looks emptiest to Kubernetes. Wait about 12 s for its cache-miss bar to fill.
4. *Schedule again.* The default picks node-1 and AKIL picks a quiet node. Walk through the coloured penalty bars.
5. *Autoscaler.* Replicas rise while cache-stress runs. Stop it and they fall once its profile drains out of the window.

**3. Results (≈1 min).** Be direct; reviewers respect it.
- AKIL lowers p99 latency by 22% over the default scheduler (62.7 → 48.9 ms, modelled).
- Static anti-affinity (26.2 ms) and a reactive descheduler (29.5 ms) both do better.
- The cause is the `min()` cache term: when every node has a noisy neighbour, AKIL can prefer the cache-stress node. In the demo it doesn't, because the other nodes are quiet.

**4. How it works (≈30 s).** Four layers: probes, collector, aggregator, score plugin. Show the formula and the `min` term you just criticised.

## Likely questions

| Question | Honest answer |
|---|---|
| Are these hardware measurements? | No. Placement is simulated using AKIL's exact scorer, and latency comes from an interference model with stated assumptions (`evidence/README.md`). Only the scoring overhead is measured. Validating on a live cluster is the next step. |
| Why not just use anti-affinity? | In our evaluation it currently performs better. AKIL's argument is that it needs no prior knowledge of which workloads clash. That only pays off once the penalty model is fixed. |
| What does a scoring call cost? | Measured: under 0.5 µs of maths plus 0.12–0.28 ms for two gRPC queries over loopback. In-cluster network latency would add to that. |
| What is the eBPF CPU overhead? | Not yet measured. |
| What about workloads with no history? | No profile gives a neutral score of 50. Low-confidence profiles have their penalties scaled by 0.25. |
| Can you fix the cache term? | We tried using the neighbour's own miss rate as a post-hoc ablation. Co-location falls from 46% to 28% but p99 doesn't improve, so the whole penalty model needs rethinking. |
