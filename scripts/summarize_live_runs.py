#!/usr/bin/env python3
"""Summarises evidence/raw_data/live_cluster_runs.csv (deploy/experiment/run.sh).

Writes evidence/processed_data/live_cluster_summary.json and a copy the
frontend imports (frontend/src/lib/live_summary.json). Means with 95% CIs
(Student t) over trials; placement counts per scheduler.
"""
import csv
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "evidence/raw_data/live_cluster_runs.csv"
OUTS = [ROOT / "evidence/processed_data/live_cluster_summary.json",
        ROOT / "frontend/src/lib/live_summary.json"]

# two-sided 95% t critical values by degrees of freedom
T95 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
       8: 2.306, 9: 2.262, 10: 2.228, 14: 2.145, 19: 2.093, 29: 2.045}


def ci(xs):
    if len(xs) < 2:
        return 0.0
    df = len(xs) - 1
    t = T95.get(df) or T95[max(k for k in T95 if k <= df)]
    return t * statistics.stdev(xs) / len(xs) ** 0.5


def stats(rows):
    out = {"trials": len(rows), "requests": sum(int(r["requests"]) for r in rows),
           "errors": sum(int(r["errors"]) for r in rows),
           "fail_open_scores": sum(int(r.get("fail_open") or 0) for r in rows)}
    for k in ("p50_ms", "p90_ms", "p99_ms", "p999_ms"):
        xs = [float(r[k]) for r in rows]
        out[k] = {"mean": round(statistics.mean(xs), 2), "ci95": round(ci(xs), 2),
                  "min": round(min(xs), 2), "max": round(max(xs), 2)}
    return out


def main():
    rows = list(csv.DictReader(RAW.open()))
    groups = defaultdict(list)
    for r in rows:
        if r["phase"] == "pinned":
            label = "isolated" if r["scheduler"] == "isolated" else r["neighbour"]
            groups[("pinned", label)].append(r)
        else:
            groups[("placed", r["scheduler"])].append(r)

    summary = {"source": "deploy/experiment/run.sh on a 4-node kind cluster (i5-13500H, 1 P-core + 2 E-cores per node)",
               "pinned": {}, "placed": {}}
    for (phase, label), rs in sorted(groups.items()):
        s = stats(rs)
        if phase == "placed":
            s["placements"] = dict(Counter(f'{r["node"]} ({r["neighbour"]})' for r in rs))
        summary[phase][label] = s

    for out in OUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
