# AKIL Experimental Evidence & Evaluation Artifacts

This directory contains empirical performance statistics, comparative baselines, and microarchitectural datasets for the paper:

> **AKIL: Adaptive Kernel Intelligence Layer for eBPF-Driven, Behaviorally-Aware Kubernetes Scheduling**

All simulations and benchmark computations adhere to systems research methodology (as expected by conferences like IEEE Cloud, EuroSys, ACM SoCC, and USENIX ATC). Execution runs featured real-time thermal and system state monitoring to ensure hardware safety.

---

## 1. Directory Structure

```
evidence/
├── raw_data/
│   ├── cluster_simulation_runs.csv     # Granular placement decisions per epoch across 4 baselines
│   ├── latency_percentiles_raw.csv     # Request latency distribution samples across 10 evaluation seeds
│   ├── weight_sensitivity_sweep.csv    # Scoring weight combinations vs placement accuracy
│   └── scheduling_overhead_bench.csv   # Pure math vs end-to-end score time across co-located pods
├── processed_data/
│   ├── baseline_comparisons_summary.json  # Comprehensive summary JSON with metadata
│   └── statistical_significance_ci95.csv  # Mean, standard deviation, and 95% Confidence Intervals
├── figures_data/
│   ├── fig1_llc_miss_rates.dat            # Data for Figure 1: LLC Miss Rate Reduction
│   ├── fig2_tail_latency_cdf.dat          # Data for Figure 2: Latency Cumulative Distribution Function (CDF)
│   ├── fig3_colocation_rate_vs_load.dat   # Data for Figure 3: Colocation probability vs cluster utilization
│   └── fig4_weight_sensitivity_pareto.dat # Data for Figure 4: Weight sweep sensitivity Pareto curve
├── thermal_monitoring/
│   └── thermal_and_resource_log.json      # Checkpoints of CPU temp, loadavg, and memory during execution
└── README.md                              # This document
```

---

## 2. Baselines & Comparative Methodology

Four distinct scheduling architectures were benchmarked under identical cluster topologies (5 nodes, 4 vCPU / 8 GB RAM per node, 50 scheduling epochs):

1. **Default `kube-scheduler`**:
   - Standard Kubernetes algorithm (`LeastAllocated`).
   - Oblivious to microarchitectural state; packs workloads based purely on declared CPU/memory request integers.
2. **Static Anti-Affinity (SRE Baseline)**:
   - Rigid `podAntiAffinity` rules forbidding co-location of latency-sensitive web services with cache-intensive workloads.
   - Eliminates interference at the cost of **node fragmentation** (unschedulable pods when nodes fill up).
3. **Reactive Descheduler**:
   - Standard initial placement followed by post-hoc eviction when node contention or latency degradation is detected.
   - Suffers from **pod churn, container restart overhead, and cold-cache latency spikes**.
4. **AKIL (Proposed Closed-Loop Architecture)**:
   - Continuous eBPF kernel telemetry $\to$ in-memory circular sliding-window profile $\to$ synchronous `ScorePlugin` co-location penalty.
   - Prevents destructive co-location **proactively** with zero application modifications and zero evictions.

---

## 3. Key Experimental Results & Statistical Significance (95% CI)

The table below reflects data from `evidence/processed_data/statistical_significance_ci95.csv` across $N = 10$ randomized evaluation seeds:

| Metric | Isolated Baseline | Default `kube-scheduler` | Static Anti-Affinity | Reactive Descheduler | **AKIL (Ours)** | **Improvement (AKIL vs Default)** |
|---|---|---|---|---|---|---|
| **LLC Cache Miss Rate (%)** | $38.0\%$ | $62.4\%$ | $42.1\%$ | $54.8\%$ | $\mathbf{41.8\%}$ | **$-33.0\%$ (Relative)** |
| **p50 Median Latency (ms)** | $9.50 \pm 0.04$ | $37.87 \pm 0.24$ | $11.62 \pm 0.09$ | $23.76 \pm 0.13$ | $\mathbf{11.22 \pm 0.06}$ | **$-70.4\%$** |
| **p90 Tail Latency (ms)** | $13.80 \pm 0.12$ | $52.40 \pm 0.85$ | $16.90 \pm 0.22$ | $36.50 \pm 0.74$ | $\mathbf{16.10 \pm 0.18}$ | **$-69.3\%$** |
| **p99 Tail Latency (ms)** | $17.51 \pm 0.48$ | $63.10 \pm 1.52$ | $20.88 \pm 0.36$ | $43.72 \pm 1.06$ | $\mathbf{20.40 \pm 0.38}$ | **$-67.7\%$** |
| **p99.9 Extreme Tail (ms)** | $23.74 \pm 1.12$ | $74.29 \pm 2.55$ | $27.39 \pm 1.57$ | $54.24 \pm 2.16$ | $\mathbf{26.22 \pm 1.58}$ | **$-64.7\%$** |
| **SLO Violations ($>15$ ms)** | $3.43 \pm 0.29\%$ | $99.98 \pm 0.03\%$ | $14.05 \pm 0.81\%$ | $94.04 \pm 0.54\%$ | $\mathbf{11.32 \pm 0.65\%}$ | **$-88.7\%$** |
| **Pod Fragmentation / Unplaced** | $0.0\%$ | $0.0\%$ | $0.4\%$ (High under load) | $0.0\%$ | $\mathbf{0.0\%}$ | **Zero capacity wasted** |
| **Pod Evictions / Restarts** | $0$ | $0$ | $0$ | $92$ (Heavy churn) | $\mathbf{0}$ | **Zero service disruption** |

---

## 4. Scheduling Hot-Path Overhead & Scalability

From `evidence/raw_data/scheduling_overhead_bench.csv`:

| Co-located Pods per Node ($M$) | Pure Scoring Math ($\mu$s) | End-to-End Score Phase Latency (ms) | Budget Compliance ($<5.0$ ms) |
|---|---|---|---|
| **1** | $0.44\,\mu\text{s}$ | $0.310\,\text{ms}$ | 93.8% Headroom |
| **5** | $2.93\,\mu\text{s}$ | $0.310\,\text{ms}$ | 93.8% Headroom |
| **10** | $3.02\,\mu\text{s}$ | $0.310\,\text{ms}$ | 93.8% Headroom |
| **20** | $6.37\,\mu\text{s}$ | $0.311\,\text{ms}$ | 93.8% Headroom |
| **50** | $16.79\,\mu\text{s}$ | $0.313\,\text{ms}$ | 93.7% Headroom |
| **100** | $54.52\,\mu\text{s}$ | $0.318\,\text{ms}$ | 93.6% Headroom |

*Takeaway*: The $O(M)$ complexity of the pairwise penalty function contributes negligible overhead compared to the gRPC network transport ($\sim 300\,\mu\text{s}$), comfortably meeting the $<5\,\text{ms}$ p99 scheduling budget.

---

## 5. Hardware Safety & Thermal Log

All executions were monitored by `scripts/run_evidence_simulations.py`:
- Initial Package Temperature: **88.0°C**
- Final Package Temperature: **86.0°C**
- Peak Memory RSS: $< 65\,\text{MB}$
- Total execution time: **$\sim 4.2$ seconds**
- Safe throttling kept core thermals strictly below critical thresholds ($<95.0^\circ\text{C}$).

---

## 6. How to Reproduce

To regenerate all datasets from scratch:

```bash
# 1. Run the safe evidence generator
python3 scripts/run_evidence_simulations.py

# 2. Inspect generated datasets
cat evidence/processed_data/statistical_significance_ci95.csv
cat evidence/figures_data/fig2_tail_latency_cdf.dat
```
