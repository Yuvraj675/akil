#!/usr/bin/env python3
"""
scripts/run_evidence_simulations.py
AKIL evaluation: trace-driven placement simulation + interference latency model.

What is simulated vs measured
------------------------------
* Placement (Exp. 1) is simulated: each scheduler places the same random pod
  arrivals onto a 5-node cluster. The AKIL scorer is a line-for-line port of
  pkg/scoring/scorer.go (same weights, same normalisation constants, corrected
  cache term — see below), combined with the default LeastAllocated score using
  the plugin weight from deploy/kubernetes/scheduler-config.yaml.
* Latency and LLC miss rate (Exp. 2) are MODEL OUTPUTS, derived per web pod from
  the neighbours that scheduler actually placed next to it. The per-neighbour
  interference coefficients in INTERFERENCE are grounded in published measurements
  from Heracles [Lo et al., ISCA 2015], PARTIES [Park et al., ASPLOS 2019], and
  Ubik [Kasture & Sanchez, ASPLOS 2016]; they are not measured on this hardware.
* Scheduling overhead (Exp. 4) is MEASURED by running the Go benchmarks in
  pkg/scoring and cmd/aggregator (scorer math + real gRPC round-trips over loopback).

Baselines compared:
  Default-K8s     — LeastAllocated on CPU requests (stock Kubernetes)
  BinPacking      — MostAllocated: packs pods onto fewest nodes (density-first)
  Trimaran-TLP    — TargetLoadPacking: schedules towards 50% CPU utilisation target
                    [Trimaran, Chen et al., EuroSys 2021 Workshop]
  AKIL            — Corrected cache-penalty scorer.go port. The cache term now uses
                    the neighbour's miss rate directly (not min(candidate, neighbour)),
                    which correctly captures the pressure an LLC-thrashing neighbour
                    exerts regardless of the victim's own miss rate.
"""

import csv
import json
import math
import os
import random
import re
import subprocess
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVID = os.path.join(ROOT, "evidence")

# ---------------------------------------------------------------------------
# Workloads: requests from benchmarks/synthetic-workloads.yaml; kernel profiles
# are per-workload rates used throughout the paper.
# ---------------------------------------------------------------------------
WORKLOADS = {
    "baseline-web": {"cpu": 100, "mem": 128, "cache": 120_000, "lock": 0.04, "pf": 350,   "cs": 2500},
    "cache-stress": {"cpu": 100, "mem": 128, "cache": 900_000, "lock": 0.08, "pf": 1200,  "cs": 4000},
    "lock-stress":  {"cpu": 100, "mem": 128, "cache": 200_000, "lock": 0.65, "pf": 500,   "cs": 9500},
    "batch-worker": {"cpu": 200, "mem": 256, "cache": 150_000, "lock": 0.05, "pf": 7500,  "cs": 1800},
}
NODE_CPU, NODE_MEM = 2000, 4096
WEB_SLO_MS = 15.0

# Interference a neighbour of each type inflicts on a baseline-web pod.
# Coefficients are grounded in published measurements:
#   cache-stress llc=0.30: LLC eviction rate consistent with Heracles Fig. 5
#     (batch co-tenant causes ~30% LLC miss-rate increase on LC service).
#   lock-stress bus=0.35: synchronisation pressure modelled after PARTIES Table 3.
#   batch-worker: moderate interference from Ubik §5 memory-bandwidth experiments.
#   llc: fraction of the web pod's remaining LLC hits turned into misses per neighbour.
#   bus: additive memory-bus / run-queue contention multiplier.
INTERFERENCE = {
    "cache-stress": {"llc": 0.30, "bus": 0.80},  # Heracles [Lo 2015] ~30% LLC degradation
    "lock-stress":  {"llc": 0.03, "bus": 0.35},  # PARTIES [Park 2019] synchronisation overhead
    "batch-worker": {"llc": 0.08, "bus": 0.25},  # Ubik [Kasture 2016] memory-bandwidth
    "baseline-web": {"llc": 0.02, "bus": 0.05},  # minimal self-interference
}
ISOLATED_LLC = 0.38  # baseline-web LLC miss fraction in isolation

# ---------------------------------------------------------------------------
# AKIL Scorer — line-for-line port of pkg/scoring/scorer.go (corrected cache term)
# ---------------------------------------------------------------------------
WEIGHTS = (35, 30, 20, 15)   # cache, lock, page-fault, ctx-switch
GO_MAX  = {"cache": 1e6, "pf": 1e4, "cs": 1e4}
AKIL_PLUGIN_WEIGHT = 25      # deploy/kubernetes/scheduler-config.yaml


def akil_score(candidate, residents, mx=GO_MAX, weights=WEIGHTS):
    """
    Port of pkg/scoring/scorer.go Score().

    Cache term: uses the neighbour's own cache miss rate (corrected from
    the original min(candidate, neighbour) which capped a thrashing neighbour's
    penalty at the victim's own rate, causing AKIL to underestimate LLC-heavy
    co-tenants).
    """
    if not residents:
        return 100.0
    c = WORKLOADS[candidate]
    wc, wl, wp, ws = weights
    penalty = 0.0
    for r in residents:
        p = WORKLOADS[r]
        # Corrected: neighbour's miss rate, not min(candidate, neighbour)
        cache   = p["cache"] / mx["cache"] * wc
        lock    = (c["lock"] + p["lock"]) * wl
        pf      = (c["pf"]   + p["pf"])   / mx["pf"] * wp
        cs      = (c["cs"]   + p["cs"])   / mx["cs"] * ws
        penalty += cache + lock + pf + cs
    return max(0.0, min(100.0, round(100.0 - penalty)))


# ---------------------------------------------------------------------------
# Node model
# ---------------------------------------------------------------------------
class Node:
    def __init__(self, name):
        self.name, self.pods = name, []

    def cpu_used(self):
        return sum(WORKLOADS[p]["cpu"] for p in self.pods)

    def fits(self, pod):
        mem = sum(WORKLOADS[p]["mem"] for p in self.pods)
        return (self.cpu_used() + WORKLOADS[pod]["cpu"] <= NODE_CPU and
                mem + WORKLOADS[pod]["mem"] <= NODE_MEM)

    def least_allocated(self, pod):
        return (NODE_CPU - self.cpu_used() - WORKLOADS[pod]["cpu"]) / NODE_CPU * 100

    def utilisation(self):
        return self.cpu_used() / NODE_CPU


# ---------------------------------------------------------------------------
# Scheduler implementations
# ---------------------------------------------------------------------------
def pick_default(pod, nodes, rng):
    """LeastAllocated: maximise remaining CPU headroom."""
    feasible = [n for n in nodes if n.fits(pod)]
    if not feasible:
        return None
    return max(feasible, key=lambda n: (n.least_allocated(pod), rng.random()))


def pick_binpacking(pod, nodes, rng):
    """
    MostAllocated / BinPacking: pack pods onto the most-loaded node that
    still has capacity. Maximises utilisation, minimises fragmentation.
    """
    feasible = [n for n in nodes if n.fits(pod)]
    if not feasible:
        return None
    return max(feasible, key=lambda n: (n.utilisation(), rng.random()))


def pick_trimaran_tlp(pod, nodes, rng, target_util=0.50):
    """
    Trimaran TargetLoadPacking [Chen et al., EuroSys Workshop 2021]:
    Prefers nodes whose post-placement utilisation is closest to the target.
    Below target: linearly increasing score (fill towards target).
    Above target: linearly decreasing score (avoid overload).
    """
    feasible = [n for n in nodes if n.fits(pod)]
    if not feasible:
        return None

    def tlp_score(n):
        u = (n.cpu_used() + WORKLOADS[pod]["cpu"]) / NODE_CPU
        if u <= target_util:
            return u / target_util * 100.0
        else:
            return max(0.0, 100.0 - (u - target_util) / (1.0 - target_util) * 100.0)

    return max(feasible, key=lambda n: (tlp_score(n), rng.random()))


def pick_akil(pod, nodes, rng):
    """AKIL: weighted combination of AKIL score and LeastAllocated."""
    feasible = [n for n in nodes if n.fits(pod)]
    if not feasible:
        return None
    return max(feasible,
               key=lambda n: (AKIL_PLUGIN_WEIGHT * akil_score(pod, n.pods) +
                               n.least_allocated(pod),
                               rng.random()))


SCHEDULERS = ["Default-K8s", "BinPacking", "Trimaran-TLP", "AKIL"]

PICKER = {
    "Default-K8s":  pick_default,
    "BinPacking":   pick_binpacking,
    "Trimaran-TLP": pick_trimaran_tlp,
    "AKIL":         pick_akil,
}


def place(arrivals, scheduler, rng, num_nodes=5):
    """Place arrivals in order. Returns (nodes, unplaced)."""
    nodes = [Node(f"node-{i+1}") for i in range(num_nodes)]
    unplaced = 0
    for pod in arrivals:
        n = PICKER[scheduler](pod, nodes, rng)
        if n is None:
            unplaced += 1
        else:
            n.pods.append(pod)
    return nodes, unplaced


# ---------------------------------------------------------------------------
# Latency model: per web pod, from its actual neighbours
# ---------------------------------------------------------------------------
def web_pod_condition(node):
    neighbours = [p for p in node.pods if p != "baseline-web"]
    # Remove exactly one baseline-web (the pod itself); keep remaining web pods as neighbours
    remaining = list(node.pods)
    remaining.remove("baseline-web")
    hit = 1.0 - ISOLATED_LLC
    bus = 1.0
    for nb in remaining:
        hit *= 1.0 - INTERFERENCE[nb]["llc"]
        bus += INTERFERENCE[nb]["bus"]
    return 1.0 - hit, bus


def sample_latency(rng, llc_mean, bus):
    base  = rng.lognormvariate(math.log(3.5), 0.25)
    llc   = max(0.1, min(0.99, rng.gauss(llc_mean, 0.04)))
    stall = (llc ** 2.2) * 35.0 * bus
    jitter = rng.expovariate(1.0 / (2.0 * bus))
    return base + stall + jitter


def pct(sorted_vals, q):
    return sorted_vals[min(len(sorted_vals) - 1, int(len(sorted_vals) * q))]


def mean_sd_ci(vals):
    m  = sum(vals) / len(vals)
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / max(1, len(vals) - 1))
    return {"mean": round(m, 2), "sd": round(sd, 2),
            "ci95": round(2.262 * sd / math.sqrt(len(vals)), 2)}  # t(0.975,9)


def summarise(lat, llcs, cs_load):
    lat.sort()
    return {
        "p50":  pct(lat, 0.50), "p90": pct(lat, 0.90),
        "p99":  pct(lat, 0.99), "p999": pct(lat, 0.999),
        "slo_pct":           100.0 * sum(1 for x in lat if x > WEB_SLO_MS) / len(lat),
        "llc_miss_rate":     100.0 * sum(llcs) / len(llcs),
        "node_ctx_switch_load": sum(cs_load) / len(cs_load),
    }


# ---------------------------------------------------------------------------
# Exp 1+2: placement simulation + derived latency
# ---------------------------------------------------------------------------
def run_main_experiment(num_seeds=10, epochs=50, arrivals_per_epoch=15,
                        samples_per_web_pod=200):
    print("[*] Exp 1+2: placement simulation and derived latency")
    pool = ["cache-stress", "lock-stress", "batch-worker",
            "baseline-web", "baseline-web", "batch-worker"]
    per_seed        = {s: [] for s in SCHEDULERS + ["Isolated (Clean)"]}
    placement_rows, latency_rows = [], []
    coloc_totals = {s: {"web": 0, "coloc": 0, "unplaced": 0, "pods": 0}
                    for s in SCHEDULERS}

    for seed in range(num_seeds):
        wl_rng = random.Random(seed)
        epochs_arrivals = [
            [wl_rng.choice(pool) for _ in range(arrivals_per_epoch)]
            for _ in range(epochs)
        ]

        for s in SCHEDULERS:
            rng = random.Random(10_000 + seed)
            lat, llcs, cs_load = [], [], []
            for e, arrivals in enumerate(epochs_arrivals):
                nodes, unplaced = place(arrivals, s, rng)
                t = coloc_totals[s]
                t["unplaced"] += unplaced
                t["pods"]     += len(arrivals)
                for n in nodes:
                    webs = n.pods.count("baseline-web")
                    t["web"] += webs
                    if "cache-stress" in n.pods:
                        t["coloc"] += webs
                    for _ in range(webs):
                        llc, bus = web_pod_condition(n)
                        llcs.append(llc)
                        cs_load.append(sum(WORKLOADS[p]["cs"] for p in n.pods))
                        for _ in range(samples_per_web_pod):
                            lat.append(sample_latency(rng, llc, bus))
                    if seed == 0:
                        for p in n.pods:
                            placement_rows.append({
                                "seed": seed, "epoch": e, "scheduler": s,
                                "pod_type": p, "node": n.name,
                                "colocated_with_cache_stress":
                                    p == "baseline-web" and "cache-stress" in n.pods,
                            })
            per_seed[s].append(summarise(lat, llcs, cs_load))
            if seed == 0:
                latency_rows += [
                    {"seed": seed, "config": s, "latency_ms": round(x, 3)}
                    for x in lat[:1000]
                ]

        # Oracle: every web pod alone on its own node
        rng    = random.Random(20_000 + seed)
        n_web  = sum(a.count("baseline-web") for a in epochs_arrivals)
        lat_iso = [sample_latency(rng, ISOLATED_LLC, 1.0)
                   for _ in range(n_web * samples_per_web_pod)]
        per_seed["Isolated (Clean)"].append(
            summarise(lat_iso, [ISOLATED_LLC] * n_web,
                      [WORKLOADS["baseline-web"]["cs"]] * n_web))
        if seed == 0:
            latency_rows += [
                {"seed": seed, "config": "Isolated (Clean)",
                 "latency_ms": round(x, 3)}
                for x in lat_iso[:1000]
            ]

    stats = {
        cfg: {m: mean_sd_ci([r[m] for r in runs]) for m in runs[0]}
        for cfg, runs in per_seed.items()
    }
    coloc = {
        s: {
            "web_pods_scheduled":                t["web"],
            "web_pods_colocated_with_cache_stress": t["coloc"],
            "colocation_rate_pct":
                round(100 * t["coloc"] / max(1, t["web"]), 2),
            "unplaced_pct":
                round(100 * t["unplaced"] / max(1, t["pods"]), 2),
        }
        for s, t in coloc_totals.items()
    }

    write_csv("raw_data/cluster_simulation_runs.csv",   placement_rows)
    write_csv("raw_data/latency_percentiles_raw.csv",    latency_rows)
    return stats, coloc


# ---------------------------------------------------------------------------
# Exp 3: measured overhead (Go benchmarks)
# ---------------------------------------------------------------------------
def run_overhead_benchmarks():
    print("[*] Exp 3: Go benchmarks (scorer math + gRPC round-trips)")
    out = subprocess.run(
        ["go", "test", "-run", "^$", "-bench", ".", "-benchtime", "2s",
         "-count", "5", "./pkg/scoring", "./cmd/aggregator"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    samples = {}
    for name, m, ns in re.findall(
        r"Benchmark(\w+)/colocated=(\d+)-\d+\s+\d+\s+([\d.]+) ns/op", out
    ):
        samples.setdefault((name, int(m)), []).append(float(ns))
    rows = []
    for m in sorted({k[1] for k in samples}):
        score_ns = samples[("Score", m)]
        rpc_ns   = samples[("ScoreQueries", m)]
        rows.append({
            "colocated_pods":         m,
            "scorer_math_ns_median":  round(sorted(score_ns)[len(score_ns) // 2], 1),
            "grpc_queries_us_median": round(sorted(rpc_ns)[len(rpc_ns) // 2] / 1000, 1),
            "grpc_queries_us_max":    round(max(rpc_ns) / 1000, 1),
        })
    write_csv("raw_data/scheduling_overhead_bench.csv", rows)
    cpu = subprocess.run(
        ["sh", "-c", "lscpu | sed -n 's/Model name: *//p'"],
        capture_output=True, text=True,
    ).stdout.strip()
    return rows, cpu


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def write_csv(rel, rows):
    path = os.path.join(EVID, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    stats, coloc = run_main_experiment()
    overhead, cpu = run_overhead_benchmarks()

    summary = {
        "metadata": {
            "generated_at":         datetime.now().isoformat(timespec="seconds"),
            "method":               (
                "trace-driven placement simulation; latency/LLC are model outputs "
                "grounded in Heracles/PARTIES/Ubik interference measurements; "
                "overhead measured via Go benchmarks"
            ),
            "seeds":                10,
            "epochs_per_seed":      50,
            "arrivals_per_epoch":   15,
            "nodes":                5,
            "akil_scorer":          "corrected port of pkg/scoring/scorer.go "
                                    "(cache term = neighbour rate, not min)",
            "akil_plugin_weight":   AKIL_PLUGIN_WEIGHT,
            "interference_model":   INTERFERENCE,
            "interference_sources": {
                "cache-stress": "Heracles [Lo, ISCA 2015] Fig. 5",
                "lock-stress":  "PARTIES [Park, ASPLOS 2019] Table 3",
                "batch-worker": "Ubik [Kasture, ASPLOS 2016] §5",
            },
            "benchmark_host_cpu": cpu,
        },
        "placement_summary":       coloc,
        "latency_and_llc_summary": stats,
        "overhead_benchmarks":     overhead,
    }

    os.makedirs(os.path.join(EVID, "processed_data"), exist_ok=True)
    with open(os.path.join(EVID, "processed_data/baseline_comparisons_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    rows = []
    for cfg, m in stats.items():
        row = {"configuration": cfg}
        for k in ("llc_miss_rate", "p50", "p99", "p999", "slo_pct", "node_ctx_switch_load"):
            row[f"{k}_mean"], row[f"{k}_ci95"] = m[k]["mean"], m[k]["ci95"]
        rows.append(row)
    write_csv("processed_data/statistical_significance_ci95.csv", rows)

    os.makedirs(os.path.join(EVID, "figures_data"), exist_ok=True)
    with open(os.path.join(EVID, "figures_data/fig1_llc_miss_rates.dat"), "w") as f:
        f.write("# Configuration\tLLC_miss_pct\tci95\n")
        for cfg, m in stats.items():
            f.write(f"{cfg}\t{m['llc_miss_rate']['mean']}\t{m['llc_miss_rate']['ci95']}\n")
    with open(os.path.join(EVID, "figures_data/fig2_p99_latency.dat"), "w") as f:
        f.write("# Configuration\tp99_ms\tci95\n")
        for cfg, m in stats.items():
            f.write(f"{cfg}\t{m['p99']['mean']}\t{m['p99']['ci95']}\n")

    # Print summary to stdout
    print("\n=== Headline results (mean ± 95% CI, 10 seeds) ===")
    order = ["Isolated (Clean)"] + SCHEDULERS
    for cfg in order:
        m = stats[cfg]
        c = coloc.get(cfg, {})
        print(f"  {cfg:18s}  p99={m['p99']['mean']:6.2f}±{m['p99']['ci95']:<5}  "
              f"LLC={m['llc_miss_rate']['mean']:5.1f}%  "
              f"SLO-viol={m['slo_pct']['mean']:5.1f}%  "
              f"coloc={c.get('colocation_rate_pct', '--'):>5}%")
    print("\n=== Scheduling overhead ===")
    for r in overhead:
        print(f"  {r}")


if __name__ == "__main__":
    main()
