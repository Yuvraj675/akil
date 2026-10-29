# AKIL paper: viability, novelty and venue assessment

Assessed 27 October 2026 against `akil_paper.tex` (commit `69dc3e7`, branch `live-cluster-evaluation`) and the evidence in `evidence/`.

## Verdict

| | Score |
|---|---|
| **Overall presentability** | **4.5 / 10**: presentable at a workshop or a student/regional conference now; **not ready for a journal**. |
| Q1 journal | Not viable as is (≈5% acceptance chance) |
| Q2 journal | Unlikely as is (≈10–15%); possible after the major work in § 6 |
| Q3 journal | Possible after revisions (≈35–45%) |
| Q4 journal | Likely (≈60–70%), though a Q4 venue would undersell the work once it is fixed |
| Top systems conference (OSDI, EuroSys, ATC, SoCC) | Not viable (<5%) |
| Mid-tier conference (IEEE CLOUD, CCGrid, Middleware, ICPE) | Unlikely as is (≈15%); reasonable after § 6 |
| Workshop or student track (e.g. eBPF/systems workshops, CloudCom, UCC) | **Good fit now** (≈50–65%) |

**In one line:** the engineering is real and well documented, but the novelty claim is overstated relative to existing work, and the only hardware measurement shows no latency benefit. Reviewers at journal level would reject on both counts.

## 1. What the paper claims

1. eBPF probes collect four per-cgroup kernel signals: LLC misses, lock contention, page faults and context switches.
2. A sliding-window aggregator turns them into per-workload runtime profiles.
3. A Kubernetes Scheduling Framework **Score plugin** penalises nodes whose residents would interfere.
4. Results: in simulation, a **21% lower p99 than the default scheduler** and **over 80% lower than bin packing or Trimaran**. Live cluster: the noisy neighbour was **avoided in 9 of 10 trials, but there was no latency improvement**.

The paper's own novelty statement (§ Discussion, "Novelty Scope") is narrow and honest: the contribution is the *closed-loop integration* of eBPF telemetry into the standard Score extension point. The **"The Gap"** subsection is not narrow: it claims interference-aware closed loops exist only *outside* the Kubernetes stack. That is no longer true (§ 2).

## 2. Closest existing work

| Work | What it does | Overlap with AKIL | Cited by AKIL? |
|---|---|---|---|
| **CPI²** (Google, EuroSys 2013) | Uses hardware-counter CPI to detect victims, identify antagonists, and throttle them in Borg | Same core idea of hardware-counter interference detection in a cluster manager; reactive rather than at placement | **No** |
| **Tzenetopoulos et al.**, *Interference-Aware Orchestration in Kubernetes* (~2020–21) | Monitors micro-architectural events (IPC, cache misses) and ranks Kubernetes nodes with a Random Forest | **Very close**: interference-aware Kubernetes placement driven by hardware counters | **No**: the most damaging omission |
| **Koordinator / C-Koordinator** (Alibaba; arXiv 2507.18005, 2025) | Open-source Kubernetes co-location platform; predicts CPI interference from history and mitigates it at scale in production | Kubernetes-native interference-aware management with production deployment | **No** |
| *Mitigating Interference of Microservices with a Scoring Mechanism in Large-scale Clusters* (arXiv 2407.12248, 2024) | An interference score that plugs into any scheduler, for latency-critical plus best-effort co-location | Same "score nodes by interference" design | **No** |
| *An Interference-aware Approach for Co-located Container Scheduling* (arXiv 2402.08917) | Learns an interference predictor and schedules containers with it | Same problem, learned model instead of a hand-weighted one | **No** |
| *Detecting Noisy Neighbors in CPU-Isolated Cgroups Environments* (ACM, 2025) | eBPF on the Linux scheduler to detect noisy neighbours per cgroup | Same eBPF/cgroup signal path, without placement | **No** |
| **SchedBlame** (arXiv 2609.02052) | eBPF culprit-attributed CPU contention for containers on stock kernels | eBPF attribution of interference to a culprit container | **No** |
| **PANDA** (arXiv 2511.08803) | Noise-resilient antagonist identification; shows CPI-correlation methods give false positives | A direct critique AKIL's raw-rate scoring is exposed to | **No** |
| Heracles, Quasar, PARTIES, Paragon | Interference-aware co-location managers | Classic baselines | Heracles, Quasar and PARTIES yes; Paragon no |
| Trimaran (SIG Scheduling) | Load-aware Kubernetes score plugins | Same extension point, utilisation signals only | Yes |

Search coverage: web search of arXiv, ACM, ResearchGate, MDPI and Springer results. Abstracts were read, not every full paper, so verify each entry before citing it. IEEE Xplore and Scopus were not queried directly.

## 3. Novelty analysis

| Possible novelty | Already done? | Remaining novelty |
|---|---|---|
| Interference-aware scheduling | Yes: Paragon, Quasar, CPI², Heracles | None |
| Interference-aware placement **in Kubernetes** | Yes: Tzenetopoulos et al., Koordinator | None |
| Hardware counters as the signal | Yes: CPI², Tzenetopoulos | None |
| eBPF as the acquisition mechanism | Detection only (noisy-neighbour detection, SchedBlame); not wired into placement in the work found | **Small but real** |
| Delivered through the upstream **Score** extension point, failing open | Trimaran uses the same point for utilisation; Koordinator uses its own components | **Small** |
| Four signals combined into one penalty score | Hand-weighted multi-signal scoring is common | Weak: the weights are not derived, and the live run shows they are miscalibrated |
| A measured negative result: detection without latency gain | Rarely published | **Useful if framed as a finding** |

**Novelty rating: 3 / 10 as currently framed, 5 / 10 if reframed.** As written, "the gap AKIL fills" will be rejected by any reviewer who knows Koordinator or Tzenetopoulos et al. A defensible framing is: *"An eBPF-based, upstream-composable telemetry path for interference-aware scoring, with an end-to-end measurement showing that detection alone does not yield latency gains without calibrated signal weights."* That is narrower, but true and publishable.

## 4. Strengths

- **A complete, working system**: eBPF probes, collector, aggregator and scheduler plugin, all open source and reproducible from one command (`deploy/experiment/run.sh`).
- **Honest evaluation**: modelled results are labelled as modelled, and the live negative result is reported. Reviewers value this.
- **Real engineering findings from running it live**: the gRPC ack deadlock, DaemonSets saturating scores, the 5 ms budget breaking under ingest load. These are practical lessons for anyone building telemetry-driven schedulers.
- **Fail-open design** that never blocks scheduling.
- **Clear writing and structure.**

## 5. Weaknesses a reviewer will raise

Ordered by severity.

1. **Missing and contradicted related work.** CPI², Tzenetopoulos et al., Koordinator and recent interference-scoring papers are absent, and § "The Gap" is contradicted by them. *Desk-reject risk at Q1/Q2.*
2. **No demonstrated benefit on hardware.** The headline 21% comes from a model whose coefficients are taken from other papers' hardware. The one real measurement shows p50 22% worse and p99 not significantly different.
3. **Testbed validity.** One laptop running `kind`: four "nodes" that share one 18 MiB L3 cache and one memory bus, so cross-node interference contaminates every placement. Reviewers will not accept this as a cluster.
4. **Small samples.** 3 trials per pinned placement (p99 CI ±22.9 ms for cache-stress) and 10 per scheduler.
5. **Synthetic workloads only.** stress-ng plus a pointer-chasing microbenchmark; no DeathStarBench, TrainTicket, Redis/memcached or production traces.
6. **Baselines.** Trimaran and BinPacking are only simulated. There is no live comparison with Koordinator or a learned interference model.
7. **Uncalibrated scoring.** Weights (35/30/20/15) and normalisation constants are hand-picked. The live run shows page faults under-penalised and context switches over-penalised.
8. **Unmeasured overheads.** No eBPF CPU overhead or collector footprint, although "low overhead" is a stated goal; the aggregator used about 70% of a core on ingest.
9. **Scale.** Nothing beyond 4 nodes and 3 neighbours, and no scheduling-throughput measurement.

## 6. What it would take to reach each tier

**Workshop or student conference (achievable now, about 1–2 weeks):**
- Add the related work in § 2 and rewrite "The Gap" and the novelty claim to the framing in § 3.
- Lead with the system and the live-cluster finding; present the simulation as secondary.

**Mid-tier conference or Q3 journal (about 1–2 months):**
- Everything above, plus:
- Run on **real machines**: at least 3–5 physical or cloud VMs, ideally on separate sockets or hosts so their LLCs are independent.
- **Calibrate the weights** on a training set of neighbour types, and evaluate on a held-out set.
- Use at least one **real benchmark** (DeathStarBench social-network or hotel-reservation) and more trials (≥30 per configuration).
- **Measure eBPF and collector overhead** (CPU per node, events/s, ingest latency).
- Fix the query path (batch node queries in PreScore) and report scheduling throughput.

**Q2 journal (about 3–6 months):**
- Everything above, plus:
- A live head-to-head with **Koordinator** (or a reimplementation of Tzenetopoulos et al.'s Random Forest ranking) and Trimaran.
- A **learned or adaptive** penalty model (online regression from observed SLO violations), going beyond hand-tuned weights.
- Scale to 20+ nodes (a cloud cluster) with mixed real workloads, and a sensitivity analysis.

**Q1 journal (e.g. IEEE TPDS, IEEE TCC, FGCS):** Q2 work plus a clear, quantified win over the strongest baseline on real hardware, at a scale and with workloads that look like production, and a theoretical or modelling contribution (for example, a predictive interference model with error bounds). Not realistic without a substantially new contribution.

## 7. Venue suggestions

Quartiles change yearly; check the current rank on SJR (scimagojr.com) or JCR before submitting.

| Tier | Candidate venues | Fit |
|---|---|---|
| Workshop / student | eBPF and kernel workshops (e.g. ACM SIGCOMM eBPF workshop), IEEE CloudCom, UCC, student research tracks at Middleware or SoCC | Good now, after § 6 tier 1 |
| Mid-tier conference | IEEE CLOUD, IEEE/ACM CCGrid, ACM/IFIP Middleware, ACM/SPEC ICPE | After tier 2 |
| Q3–Q2 journal | *Journal of Cloud Computing* (Springer), *Cluster Computing*, *Software: Practice and Experience*, *Journal of Grid Computing*, *Concurrency and Computation: Practice and Experience* | After tier 2; SPE suits the systems-engineering angle |
| Q1 journal | *Future Generation Computer Systems*, *IEEE Transactions on Cloud Computing*, *IEEE TPDS*, *Journal of Systems and Software* | Only after tier 3 |

## 8. Scorecard

Reviewer-style scores, 1 (poor) to 10 (excellent), for the paper as it stands.

| Criterion | Score | Note |
|---|---|---|
| Problem significance | 7 | Noisy neighbours in Kubernetes are a real, recognised problem |
| Novelty | 3 | Close prior work uncited; 5 if reframed |
| Technical soundness of the system | 6 | Works end to end; scoring model ad hoc |
| Evaluation rigour | 3 | One laptop, small n, synthetic workloads, modelled headline |
| Results strength | 2 | No measured latency benefit |
| Related-work coverage | 3 | Misses the closest Kubernetes and eBPF work |
| Reproducibility | 8 | Open source, scripted, raw data included |
| Presentation | 7 | Clear, well structured, honest about limits |
| **Weighted overall** | **4.5** | Novelty, evaluation and results weighted double |

## 9. Recommendation

1. **Do not submit to a Q1 or Q2 journal yet.** It would most likely be desk-rejected or rejected on novelty and evaluation.
2. **Submit now to a workshop or student track** after the tier-1 fixes. The honest "detection does not imply benefit" result, the reproducible system and the live-run engineering lessons are a legitimate workshop contribution.
3. **Plan the Q3/Q2 journal version around the tier-2 work.** The single change that most improves the paper is a real multi-machine testbed with calibrated weights. If AKIL then shows a measured win, the paper moves up a tier.

## Sources

- [Interference-Aware Orchestration in Kubernetes (Tzenetopoulos et al.)](https://www.researchgate.net/publication/346274272_Interference-Aware_Orchestration_in_Kubernetes)
- [C-Koordinator: Interference-aware Management for Large-scale and Co-located Microservice Clusters](https://arxiv.org/pdf/2507.18005)
- [CPI²: CPU performance isolation for shared compute clusters](https://research.google/pubs/cpi2-cpu-performance-isolation-for-shared-compute-clusters/)
- [Mitigating Interference of Microservices with a Scoring Mechanism in Large-scale Clusters](https://arxiv.org/html/2407.12248)
- [An Interference-aware Approach for Co-located Container Scheduling](https://arxiv.org/pdf/2402.08917)
- [Detecting Noisy Neighbors in CPU-Isolated Cgroups Environments](https://dl.acm.org/doi/10.1145/3676151.3719376)
- [SchedBlame: Culprit-Attributed CPU Contention for Containers on Stock Kernels](https://arxiv.org/pdf/2609.02052)
- [PANDA: Noise-Resilient Antagonist Identification in Production Datacenters](https://arxiv.org/pdf/2511.08803)
- [Interference and Need Aware Workload Colocation in Hyperscale Datacenters](https://arxiv.org/pdf/2207.12499)
- [Enhancing the Kubernetes Scheduler: A State-of-the-Art Review from Cloud to Edge (MDPI)](https://www.mdpi.com/2073-431x/15/7/458)
- [Beyond the Limits: Flexible and Congestion-Aware Cluster Scheduling for the Cloud](https://arxiv.org/pdf/2608.09308)
- [Towards Solving the Noisy Neighbor Problem in Containerized Cloud Applications](https://doi.org/10.1145/3801619.3801680)
- [Reducing Noisy-Neighbor Impact with a Fuzzy Affinity-Aware Scheduler](https://www.researchgate.net/publication/308840650_Reducing_Noisy-Neighbor_Impact_with_a_Fuzzy_Affinity-Aware_Scheduler)
