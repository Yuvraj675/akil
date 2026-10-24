#!/usr/bin/env python3
"""
scripts/run_evidence_simulations.py
AKIL evaluation: trace-driven placement simulation + interference latency model.

What is simulated vs measured
-----------------------------
* Placement (Exp. 1) is simulated: each scheduler places the same random pod
  arrivals onto a 5-node cluster. The AKIL scorer is a line-for-line port of
  pkg/scoring/scorer.go (same weights, same normalisation constants), combined
  with the default LeastAllocated score using the plugin weight from
  deploy/kubernetes/scheduler-config.yaml.
* Latency and LLC miss rate (Exp. 2) are MODEL OUTPUTS, derived per web pod from
  the neighbours that scheduler actually placed next to it. The per-neighbour
  interference coefficients in INTERFERENCE are assumptions, identical for every
  scheduler; they are not measured on hardware.
* Scheduling overhead (Exp. 4) is MEASURED by running the Go benchmarks in
  pkg/scoring and cmd/aggregator (scorer math + real gRPC round-trips over loopback).

Three AKIL variants are reported:
  AKIL            — scorer.go defaults (MaxCacheMissRate 1e6, MaxPageFaultRate 1e4, MaxCtxSwitchRate 1e4)
  AKIL-calibrated — normalisation set to the maximum rate observed among the
                    workload profiles, as the ScorerConfig comment recommends
                    ("should be calibrated based on cluster-wide observations").
  AKIL-ablation-neighbour-cache — POST-HOC diagnostic, not the implemented design:
                    the cache term uses the neighbour's own miss rate instead of
                    min(candidate, neighbour).
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
# are the per-workload rates used throughout the paper.
# ---------------------------------------------------------------------------
WORKLOADS = {
    "baseline-web": {"cpu": 100, "mem": 128, "cache": 120_000, "lock": 0.04, "pf": 350,   "cs": 2500},
    "cache-stress": {"cpu": 100, "mem": 128, "cache": 900_000, "lock": 0.08, "pf": 1200,  "cs": 4000},
    "lock-stress":  {"cpu": 100, "mem": 128, "cache": 200_000, "lock": 0.65, "pf": 500,   "cs": 9500},
    "batch-worker": {"cpu": 200, "mem": 256, "cache": 150_000, "lock": 0.05, "pf": 7500,  "cs": 1800},
}
NODE_CPU, NODE_MEM = 2000, 4096
WEB_SLO_MS = 15.0

# Interference a neighbour of each type inflicts on a baseline-web pod (model assumption).
#   llc:  fraction of the web pod's remaining LLC hits turned into misses
#   bus:  additive memory-bus / run-queue contention factor
INTERFERENCE = {
    "cache-stress": {"llc": 0.30, "bus": 0.80},
    "lock-stress":  {"llc": 0.03, "bus": 0.35},
    "batch-worker": {"llc": 0.08, "bus": 0.25},
    "baseline-web": {"llc": 0.02, "bus": 0.05},
}
ISOLATED_LLC = 0.38

# ---------------------------------------------------------------------------
# Scorer: port of pkg/scoring/scorer.go
# ---------------------------------------------------------------------------
WEIGHTS = (35, 30, 20, 15)
GO_MAX = {"cache": 1e6, "pf": 1e4, "cs": 1e4}
CALIBRATED_MAX = {k: max(w[k] for w in WORKLOADS.values()) for k in ("cache", "pf", "cs")}
AKIL_PLUGIN_WEIGHT = 25  # deploy/kubernetes/scheduler-config.yaml


def akil_score(candidate, residents, mx=GO_MAX, weights=WEIGHTS, cache_term="min"):
    if not residents:
        return 100.0
    c = WORKLOADS[candidate]
    wc, wl, wp, ws = weights
    penalty = 0.0
    for r in residents:
        p = WORKLOADS[r]
        # scorer.go uses min(candidate, neighbour); the post-hoc ablation uses the neighbour's own rate
        cache = min(c["cache"], p["cache"]) if cache_term == "min" else p["cache"]
        penalty += cache / mx["cache"] * wc
        penalty += (c["lock"] + p["lock"]) * wl
        penalty += (c["pf"] + p["pf"]) / mx["pf"] * wp
        penalty += (c["cs"] + p["cs"]) / mx["cs"] * ws
    return max(0.0, min(100.0, round(100.0 - penalty)))


class Node:
    def __init__(self, name):
        self.name, self.pods = name, []

    def cpu_used(self):
        return sum(WORKLOADS[p]["cpu"] for p in self.pods)

    def fits(self, pod):
        mem = sum(WORKLOADS[p]["mem"] for p in self.pods)
        return self.cpu_used() + WORKLOADS[pod]["cpu"] <= NODE_CPU and mem + WORKLOADS[pod]["mem"] <= NODE_MEM

    def least_allocated(self, pod):
        return (NODE_CPU - self.cpu_used() - WORKLOADS[pod]["cpu"]) / NODE_CPU * 100


def pick_default(pod, nodes, rng):
    feasible = [n for n in nodes if n.fits(pod)]
    if not feasible:
        return None
    return max(feasible, key=lambda n: (n.least_allocated(pod), rng.random()))


def pick_anti_affinity(pod, nodes, rng):
    feasible = [n for n in nodes if n.fits(pod)]
    if pod == "baseline-web":
        feasible = [n for n in feasible if "cache-stress" not in n.pods]
    elif pod == "cache-stress":
        feasible = [n for n in feasible if "baseline-web" not in n.pods]
    if not feasible:
        return None  # pending: the rule cannot be satisfied
    return max(feasible, key=lambda n: (n.least_allocated(pod), rng.random()))


def pick_akil(pod, nodes, rng, mx=GO_MAX, weights=WEIGHTS, cache_term="min"):
    feasible = [n for n in nodes if n.fits(pod)]
    if not feasible:
        return None
    return max(feasible, key=lambda n: (AKIL_PLUGIN_WEIGHT * akil_score(pod, n.pods, mx, weights, cache_term) + n.least_allocated(pod), rng.random()))


SCHEDULERS = ["Default-K8s", "Static-AntiAffinity", "Reactive-Descheduler", "AKIL", "AKIL-calibrated", "AKIL-ablation-neighbour-cache"]


def place(arrivals, scheduler, rng, num_nodes=5):
    """Place arrivals in order. Returns (nodes, unplaced, evictions)."""
    nodes = [Node(f"node-{i+1}") for i in range(num_nodes)]
    unplaced = evictions = 0
    for pod in arrivals:
        if scheduler in ("Default-K8s", "Reactive-Descheduler"):
            n = pick_default(pod, nodes, rng)
        elif scheduler == "Static-AntiAffinity":
            n = pick_anti_affinity(pod, nodes, rng)
        elif scheduler == "AKIL":
            n = pick_akil(pod, nodes, rng)
        elif scheduler == "AKIL-calibrated":
            n = pick_akil(pod, nodes, rng, mx=CALIBRATED_MAX)
        else:
            n = pick_akil(pod, nodes, rng, cache_term="neighbour")
        if n is None:
            unplaced += 1
        else:
            n.pods.append(pod)
    if scheduler == "Reactive-Descheduler":
        # Post-hoc: evict web pods sharing a node with cache-stress and re-place them
        # on a node without it (the descheduler acts after interference is observed).
        for n in nodes:
            while "baseline-web" in n.pods and "cache-stress" in n.pods:
                n.pods.remove("baseline-web")
                evictions += 1
                clean = [m for m in nodes if m is not n and m.fits("baseline-web") and "cache-stress" not in m.pods]
                (max(clean, key=lambda m: m.least_allocated("baseline-web")) if clean else n).pods.append("baseline-web")
                if not clean:
                    break
    return nodes, unplaced, evictions


# ---------------------------------------------------------------------------
# Latency model: per web pod, from its actual neighbours
# ---------------------------------------------------------------------------
def web_pod_condition(node, web_index):
    neighbours = list(node.pods)
    neighbours.remove("baseline-web")  # the pod itself
    hit = 1.0 - ISOLATED_LLC
    bus = 1.0
    for nb in neighbours:
        hit *= 1.0 - INTERFERENCE[nb]["llc"]
        bus += INTERFERENCE[nb]["bus"]
    return 1.0 - hit, bus


def sample_latency(rng, llc_mean, bus):
    base = rng.lognormvariate(math.log(3.5), 0.25)
    llc = max(0.1, min(0.99, rng.gauss(llc_mean, 0.04)))
    stall = (llc ** 2.2) * 35.0 * bus
    jitter = rng.expovariate(1.0 / (2.0 * bus))
    return base + stall + jitter


def pct(sorted_vals, q):
    return sorted_vals[min(len(sorted_vals) - 1, int(len(sorted_vals) * q))]


def mean_sd_ci(vals):
    m = sum(vals) / len(vals)
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / max(1, len(vals) - 1))
    return {"mean": round(m, 2), "sd": round(sd, 2), "ci95": round(2.262 * sd / math.sqrt(len(vals)), 2)}  # t(0.975, 9)


def run_main_experiment(num_seeds=10, epochs=50, arrivals_per_epoch=15, samples_per_web_pod=200):
    print("[*] Exp 1+2: placement simulation and derived latency")
    pool = ["cache-stress", "lock-stress", "batch-worker", "baseline-web", "baseline-web", "batch-worker"]
    per_seed = {s: [] for s in SCHEDULERS + ["Isolated (Clean)"]}
    placement_rows, latency_rows = [], []
    coloc_totals = {s: {"web": 0, "coloc": 0, "unplaced": 0, "pods": 0, "evictions": 0} for s in SCHEDULERS}

    for seed in range(num_seeds):
        wl_rng = random.Random(seed)
        epochs_arrivals = [[wl_rng.choice(pool) for _ in range(arrivals_per_epoch)] for _ in range(epochs)]
        for s in SCHEDULERS:
            rng = random.Random(10_000 + seed)
            lat, llcs, cs_load = [], [], []
            for e, arrivals in enumerate(epochs_arrivals):
                nodes, unplaced, ev = place(arrivals, s, rng)
                t = coloc_totals[s]
                t["unplaced"] += unplaced
                t["pods"] += len(arrivals)
                t["evictions"] += ev
                for n in nodes:
                    webs = n.pods.count("baseline-web")
                    t["web"] += webs
                    if "cache-stress" in n.pods:
                        t["coloc"] += webs
                    for i in range(webs):
                        llc, bus = web_pod_condition(n, i)
                        llcs.append(llc)
                        cs_load.append(sum(WORKLOADS[p]["cs"] for p in n.pods))
                        for _ in range(samples_per_web_pod):
                            lat.append(sample_latency(rng, llc, bus))
                    if seed == 0:
                        for p in n.pods:
                            placement_rows.append({"seed": seed, "epoch": e, "scheduler": s, "pod_type": p, "node": n.name,
                                                   "colocated_with_cache_stress": p == "baseline-web" and "cache-stress" in n.pods})
            per_seed[s].append(summarise(lat, llcs, cs_load))
            if seed == 0:
                latency_rows += [{"seed": seed, "config": s, "latency_ms": round(x, 3)} for x in lat[:1000]]

        # Oracle: every web pod alone on its own node
        rng = random.Random(20_000 + seed)
        n_web = sum(a.count("baseline-web") for a in epochs_arrivals)
        lat = [sample_latency(rng, ISOLATED_LLC, 1.0) for _ in range(n_web * samples_per_web_pod)]
        per_seed["Isolated (Clean)"].append(summarise(lat, [ISOLATED_LLC] * n_web, [WORKLOADS["baseline-web"]["cs"]] * n_web))
        if seed == 0:
            latency_rows += [{"seed": seed, "config": "Isolated (Clean)", "latency_ms": round(x, 3)} for x in lat[:1000]]

    stats = {cfg: {m: mean_sd_ci([r[m] for r in runs]) for m in runs[0]} for cfg, runs in per_seed.items()}
    coloc = {s: {
        "web_pods_scheduled": t["web"],
        "web_pods_colocated_with_cache_stress": t["coloc"],
        "colocation_rate_pct": round(100 * t["coloc"] / max(1, t["web"]), 2),
        "unplaced_pct": round(100 * t["unplaced"] / max(1, t["pods"]), 2),
        "evictions": t["evictions"],
    } for s, t in coloc_totals.items()}

    write_csv("raw_data/cluster_simulation_runs.csv", placement_rows)
    write_csv("raw_data/latency_percentiles_raw.csv", latency_rows)
    return stats, coloc


def summarise(lat, llcs, cs_load):
    lat.sort()
    return {
        "p50": pct(lat, 0.50), "p90": pct(lat, 0.90), "p99": pct(lat, 0.99), "p999": pct(lat, 0.999),
        "slo_pct": 100.0 * sum(1 for x in lat if x > WEB_SLO_MS) / len(lat),
        "llc_miss_rate": 100.0 * sum(llcs) / len(llcs),
        "node_ctx_switch_load": sum(cs_load) / len(cs_load),
    }


# ---------------------------------------------------------------------------
# Exp 3: weight sensitivity on the canonical 3-node scenario
# ---------------------------------------------------------------------------
def run_weight_sensitivity():
    print("[*] Exp 3: weight sensitivity")
    samples = [(35, 30, 20, 15), (70, 10, 10, 10), (10, 70, 10, 10), (10, 10, 70, 10), (25, 25, 25, 25)]
    rng = random.Random(999)
    while len(samples) < 50:
        w = (rng.randint(5, 60), rng.randint(5, 50), rng.randint(5, 40))
        if 100 - sum(w) >= 5:
            samples.append((*w, 100 - sum(w)))
    rows = []
    for w in samples:
        row = {"w_cache": w[0], "w_lock": w[1], "w_pf": w[2], "w_ctx": w[3]}
        for label, mx, term in (("go_defaults", GO_MAX, "min"), ("calibrated", CALIBRATED_MAX, "min"), ("ablation", GO_MAX, "neighbour")):
            residents = {"node-1": ["cache-stress"], "node-2": ["lock-stress"], "node-3": ["batch-worker"]}
            scores = {n: akil_score("baseline-web", r, mx, w, term) for n, r in residents.items()}
            best = max(scores.values())
            # Deterministic scorer: report whether the cache-stress node is (one of) the top choice(s)
            row[f"picks_cache_stress_node_{label}"] = scores["node-1"] == best
            row[f"scores_{label}"] = "/".join(str(int(scores[n])) for n in sorted(scores))
        rows.append(row)
    write_csv("raw_data/weight_sensitivity_sweep.csv", rows)
    return rows


# ---------------------------------------------------------------------------
# Exp 4: measured overhead (Go benchmarks)
# ---------------------------------------------------------------------------
def run_overhead_benchmarks():
    print("[*] Exp 4: Go benchmarks (scorer math + gRPC round-trips)")
    out = subprocess.run(
        ["go", "test", "-run", "^$", "-bench", ".", "-benchtime", "2s", "-count", "5", "./pkg/scoring", "./cmd/aggregator"],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout
    samples = {}
    for name, m, ns in re.findall(r"Benchmark(\w+)/colocated=(\d+)-\d+\s+\d+\s+([\d.]+) ns/op", out):
        samples.setdefault((name, int(m)), []).append(float(ns))
    rows = []
    for m in sorted({k[1] for k in samples}):
        score_ns = samples[("Score", m)]
        rpc_ns = samples[("ScoreQueries", m)]
        rows.append({
            "colocated_pods": m,
            "scorer_math_ns_median": round(sorted(score_ns)[len(score_ns) // 2], 1),
            "grpc_queries_us_median": round(sorted(rpc_ns)[len(rpc_ns) // 2] / 1000, 1),
            "grpc_queries_us_max": round(max(rpc_ns) / 1000, 1),
        })
    write_csv("raw_data/scheduling_overhead_bench.csv", rows)
    cpu = subprocess.run(["sh", "-c", "lscpu | sed -n 's/Model name: *//p'"], capture_output=True, text=True).stdout.strip()
    return rows, cpu


def write_csv(rel, rows):
    path = os.path.join(EVID, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)


def main():
    stats, coloc = run_main_experiment()
    sweep = run_weight_sensitivity()
    overhead, cpu = run_overhead_benchmarks()

    summary = {
        "metadata": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "method": "trace-driven placement simulation; latency/LLC are model outputs (see INTERFERENCE); overhead measured via Go benchmarks",
            "seeds": 10, "epochs_per_seed": 50, "arrivals_per_epoch": 15, "nodes": 5,
            "akil_scorer": "port of pkg/scoring/scorer.go", "akil_plugin_weight": AKIL_PLUGIN_WEIGHT,
            "calibrated_normalisation": CALIBRATED_MAX, "interference_model": INTERFERENCE,
            "benchmark_host_cpu": cpu,
        },
        "placement_summary": coloc,
        "latency_and_llc_summary": stats,
        "weight_sensitivity": {
            "go_defaults_pct_picking_cache_stress": round(100 * sum(r["picks_cache_stress_node_go_defaults"] for r in sweep) / len(sweep), 1),
            "calibrated_pct_picking_cache_stress": round(100 * sum(r["picks_cache_stress_node_calibrated"] for r in sweep) / len(sweep), 1),
            "ablation_pct_picking_cache_stress": round(100 * sum(r["picks_cache_stress_node_ablation"] for r in sweep) / len(sweep), 1),
            "n_weight_vectors": len(sweep),
        },
        "overhead_benchmarks": overhead,
    }
    with open(os.path.join(EVID, "processed_data/baseline_comparisons_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    rows = []
    for cfg, m in stats.items():
        row = {"configuration": cfg}
        for k in ("llc_miss_rate", "p50", "p99", "p999", "slo_pct", "node_ctx_switch_load"):
            row[f"{k}_mean"], row[f"{k}_ci95"] = m[k]["mean"], m[k]["ci95"]
        rows.append(row)
    write_csv("processed_data/statistical_significance_ci95.csv", rows)

    with open(os.path.join(EVID, "figures_data/fig1_llc_miss_rates.dat"), "w") as f:
        f.write("# Configuration\tLLC_miss_pct\tci95\n")
        for cfg, m in stats.items():
            f.write(f"{cfg}\t{m['llc_miss_rate']['mean']}\t{m['llc_miss_rate']['ci95']}\n")
    with open(os.path.join(EVID, "figures_data/fig2_p99_latency.dat"), "w") as f:
        f.write("# Configuration\tp99_ms\tci95\n")
        for cfg, m in stats.items():
            f.write(f"{cfg}\t{m['p99']['mean']}\t{m['p99']['ci95']}\n")

    print(json.dumps({"placement": coloc, "weights": summary["weight_sensitivity"]}, indent=1))
    for cfg, m in stats.items():
        print(f"  {cfg:22s} p99={m['p99']['mean']:6.2f}±{m['p99']['ci95']:<5} LLC={m['llc_miss_rate']['mean']:5.1f}% "
              f"SLO-viol={m['slo_pct']['mean']:5.1f}% ctx-load={m['node_ctx_switch_load']['mean']:.0f}/s")
    for r in overhead:
        print("  ", r)


if __name__ == "__main__":
    main()
