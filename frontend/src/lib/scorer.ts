// Faithful port of pkg/scoring/scorer.go — keep the two in sync.

export type Confidence = 0 | 1 | 2 | 3; // UNKNOWN, LOW, MEDIUM, HIGH

export interface Profile {
  key: string;
  cacheMissRate: number; // misses/s
  lockRatio: number; // fraction of time in lock contention [0,1]
  pageFaultRate: number; // faults/s
  ctxSwitchRate: number; // switches/s
  samples: number;
  confidence: Confidence;
}

export const WEIGHTS = { cache: 35, lock: 30, pageFault: 20, ctxSwitch: 15 };
const MAX = { cache: 1e6, pageFault: 1e4, ctxSwitch: 1e4 };

export interface ScoreResult {
  score: number;
  cache: number;
  lock: number;
  pageFault: number;
  ctxSwitch: number;
  reason: string;
}

const DAMPENING: Record<Confidence, number> = { 0: 0, 1: 0.25, 2: 0.75, 3: 1 };

export function score(candidate: Profile, colocated: Profile[]): ScoreResult {
  const empty = { cache: 0, lock: 0, pageFault: 0, ctxSwitch: 0 };
  if (candidate.confidence === 0) return { score: 50, ...empty, reason: 'No profile for this workload yet' };
  const known = colocated.filter((p) => p.confidence !== 0);
  if (colocated.length === 0) return { score: 100, ...empty, reason: 'Empty node, nothing to interfere with' };

  const t = { ...empty };
  for (const p of known) {
    t.cache += (Math.min(candidate.cacheMissRate, p.cacheMissRate) / MAX.cache) * WEIGHTS.cache;
    t.lock += (candidate.lockRatio + p.lockRatio) * WEIGHTS.lock;
    t.pageFault += ((candidate.pageFaultRate + p.pageFaultRate) / MAX.pageFault) * WEIGHTS.pageFault;
    t.ctxSwitch += ((candidate.ctxSwitchRate + p.ctxSwitchRate) / MAX.ctxSwitch) * WEIGHTS.ctxSwitch;
  }
  const d = DAMPENING[candidate.confidence];
  const total = (t.cache + t.lock + t.pageFault + t.ctxSwitch) * d;
  const s = Math.max(0, Math.min(100, 100 - total));
  return {
    score: Math.round(s),
    cache: t.cache * d,
    lock: t.lock * d,
    pageFault: t.pageFault * d,
    ctxSwitch: t.ctxSwitch * d,
    reason: 'Co-location penalty applied',
  };
}

export function confidenceFor(samples: number): Confidence {
  if (samples > 1000) return 3;
  if (samples >= 100) return 2;
  if (samples > 0) return 1;
  return 0;
}
