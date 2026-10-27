import { useCallback, useEffect, useRef, useState } from 'react';
import { confidenceFor, type Profile } from './scorer';

export const API = (import.meta.env.VITE_AKIL_API as string | undefined) ?? 'http://localhost:8080';

// The demo backend runs with 12 × 1s buckets so profiles react within seconds.
// The paper's production setting is 12 × 5s (a 60s window).
const BUCKETS = 12;
const BUCKET_SECONDS = 1;
const WINDOW_SECONDS = BUCKETS * BUCKET_SECONDS;

export interface WorkloadSpec {
  key: string;
  name: string;
  node: string;
  cpuRequest: number; // millicores, what kube-scheduler sees
  blurb: string;
  // Per-second kernel behaviour fed into the telemetry pipeline
  cacheMisses: number;
  lockRatio: number;
  pageFaults: number;
  ctxSwitches: number;
}

export const NODES = [
  { name: 'node-1', cpu: 4000 },
  { name: 'node-2', cpu: 4000 },
  { name: 'node-3', cpu: 4000 },
];

export const CALM: WorkloadSpec[] = [
  {
    key: 'default/Deployment/batch-etl', name: 'batch-etl', node: 'node-2', cpuRequest: 1500,
    blurb: 'Nightly data job. Busy CPU, polite with memory.',
    cacheMisses: 400, lockRatio: 0.01, pageFaults: 300, ctxSwitches: 30,
  },
  {
    key: 'default/Deployment/log-shipper', name: 'log-shipper', node: 'node-3', cpuRequest: 1200,
    blurb: 'Tails logs and ships them. Mostly idle.',
    cacheMisses: 200, lockRatio: 0.005, pageFaults: 150, ctxSwitches: 20,
  },
];

// Same kernel profile as the paper's cache-stress workload (scripts/run_evidence_simulations.py).
export const NOISY: WorkloadSpec = {
  key: 'default/Deployment/cache-stress', name: 'cache-stress', node: 'node-1', cpuRequest: 100,
  blurb: 'Asks for a tenth of a core, then sweeps a 512 MB array, evicting everyone else’s cache lines.',
  cacheMisses: 900_000, lockRatio: 0.08, pageFaults: 1200, ctxSwitches: 4000,
};

// The pod we schedule. Its profile is what AKIL learned from earlier replicas of
// the same Deployment (profiles are keyed per workload, not per pod).
export const CANDIDATE: Profile & { name: string; cpuRequest: number } = {
  key: 'default/Deployment/web-frontend', name: 'web-frontend', cpuRequest: 100,
  cacheMissRate: 120_000, lockRatio: 0.04, pageFaultRate: 350, ctxSwitchRate: 2500,
  samples: 5000, confidence: 3,
};

export interface ScalingEvent { timestamp: string; action: string; reason: string; replicas: number }

// ---------- In-browser fallback: same sliding-window maths as pkg/profile ----------
type Bucket = { cm: number; lockNs: number; pf: number; cs: number; ev: number };
const emptyBucket = (): Bucket => ({ cm: 0, lockNs: 0, pf: 0, cs: 0, ev: 0 });

class LocalBackend {
  windows = new Map<string, Bucket[]>();
  replicas = 2;
  autoscale = true;
  logs: ScalingEvent[] = [];
  private lastRotate = Date.now();

  private rotate() {
    const steps = Math.floor((Date.now() - this.lastRotate) / (BUCKET_SECONDS * 1000));
    if (steps <= 0) return;
    this.lastRotate += steps * BUCKET_SECONDS * 1000;
    for (const w of this.windows.values()) {
      for (let i = 0; i < Math.min(steps, BUCKETS); i++) { w.shift(); w.push(emptyBucket()); }
    }
  }

  record(w: WorkloadSpec) {
    this.rotate();
    if (!this.windows.has(w.key)) this.windows.set(w.key, Array.from({ length: BUCKETS }, emptyBucket));
    const b = this.windows.get(w.key)![BUCKETS - 1];
    const lockNs = Math.round(w.lockRatio * 1e9);
    b.cm += w.cacheMisses; b.pf += w.pageFaults; b.cs += w.ctxSwitches; b.lockNs += lockNs;
    b.ev += w.cacheMisses + w.pageFaults + w.ctxSwitches + (lockNs > 0 ? 1 : 0);
  }

  reset(key: string) { this.windows.delete(key); }

  profiles(): Profile[] {
    this.rotate();
    return [...this.windows.entries()].map(([key, bs]) => {
      const s = bs.reduce((a, b) => ({ cm: a.cm + b.cm, lockNs: a.lockNs + b.lockNs, pf: a.pf + b.pf, cs: a.cs + b.cs, ev: a.ev + b.ev }), emptyBucket());
      return {
        key, cacheMissRate: s.cm / WINDOW_SECONDS, lockRatio: s.lockNs / (WINDOW_SECONDS * 1e9),
        pageFaultRate: s.pf / WINDOW_SECONDS, ctxSwitchRate: s.cs / WINDOW_SECONDS,
        samples: s.ev, confidence: confidenceFor(s.ev),
      };
    });
  }

  // Mirrors the simulated branch of cmd/aggregator/autoscaler.go
  autoscaleTick() {
    if (!this.autoscale) return;
    const ps = this.profiles();
    let reason = '';
    let allNominal = ps.length > 0;
    for (const p of ps) {
      if (p.ctxSwitchRate > 100) reason = `High Context Switch Rate detected (>100/s) for ${p.key}. Scaling UP to relieve CPU contention.`;
      else if (p.pageFaultRate > 5000) reason = `High Page Fault Rate detected (>5000/s) for ${p.key}. Scaling UP to distribute memory pressure.`;
      else if (p.cacheMissRate > 1000) reason = `High Cache Miss Rate detected (>1000/s) for ${p.key}. Scaling UP to improve cache locality.`;
      if (reason) { allNominal = false; break; }
      if (!(p.ctxSwitchRate < 50 && p.pageFaultRate < 2000 && p.cacheMissRate < 500)) allNominal = false;
    }
    let next = this.replicas + (reason ? 1 : 0);
    if (allNominal && this.replicas > 1) { next--; reason = 'All workload metrics nominal. Scaling DOWN to conserve resources.'; }
    next = Math.max(1, Math.min(6, next));
    if (next !== this.replicas) {
      this.logs = [...this.logs, { timestamp: new Date().toISOString(), action: next > this.replicas ? 'SCALE UP' : 'SCALE DOWN', reason, replicas: next }].slice(-50);
      this.replicas = next;
    }
  }
}

// ---------- Hook used by the live demo ----------
export type Mode = 'connecting' | 'live' | 'local';

const toProfile = (p: {
  WorkloadKey: string; CacheMissRate: number; LockContentionRatio: number;
  PageFaultRate: number; ContextSwitchRate: number; SampleCount: number; Confidence: number;
}): Profile => ({
  key: p.WorkloadKey, cacheMissRate: p.CacheMissRate, lockRatio: p.LockContentionRatio,
  pageFaultRate: p.PageFaultRate, ctxSwitchRate: p.ContextSwitchRate,
  samples: p.SampleCount, confidence: p.Confidence as Profile['confidence'],
});

async function post(path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
}

export function useCluster() {
  const [mode, setMode] = useState<Mode>('connecting');
  const [calmOn, setCalmOn] = useState(false);
  const [noisyOn, setNoisyOn] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [replicas, setReplicas] = useState(2);
  const [autoscale, setAutoscaleState] = useState(true);
  const [logs, setLogs] = useState<ScalingEvent[]>([]);
  const local = useRef(new LocalBackend());
  const modeRef = useRef<Mode>('connecting');
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Probe the aggregator once; fall back to the in-browser engine if absent.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    fetch(API + '/api/profiles', { signal: ctrl.signal })
      .then((r) => setMode(r.ok ? 'live' : 'local'))
      .catch(() => setMode('local'))
      .finally(() => clearTimeout(timer));
  }, []);

  const active = useCallback(() => [...(calmOn ? CALM : []), ...(noisyOn ? [NOISY] : [])], [calmOn, noisyOn]);

  // Telemetry injection: stands in for the eBPF collector, once per second.
  useEffect(() => {
    if (mode === 'connecting') return;
    const id = setInterval(() => {
      for (const w of active()) {
        if (modeRef.current === 'local') { local.current.record(w); continue; }
        post('/api/simulate-events', {
          workload_key: w.key, node_name: w.node, page_faults: w.pageFaults, cache_misses: w.cacheMisses,
          lock_ns: Math.round(w.lockRatio * 1e9), ctx_switches: w.ctxSwitches,
        }).catch(() => setMode('local'));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [mode, active]);

  // Local autoscaler loop, same 3s cadence as the Go one.
  useEffect(() => {
    if (mode !== 'local') return;
    const id = setInterval(() => local.current.autoscaleTick(), 3000);
    return () => clearInterval(id);
  }, [mode]);

  // Poll state.
  useEffect(() => {
    if (mode === 'connecting') return;
    const poll = async () => {
      if (mode === 'local') {
        const l = local.current;
        setProfiles(l.profiles()); setReplicas(l.replicas); setAutoscaleState(l.autoscale); setLogs(l.logs);
        return;
      }
      try {
        const [p, s, a, lg] = await Promise.all([
          fetch(API + '/api/profiles').then((r) => r.json()),
          // The replica count is optional: a cluster without demo-workload still runs live.
          fetch(API + '/api/scale').then((r) => (r.ok ? r.json() : { replicas: 0 })).catch(() => ({ replicas: 0 })),
          fetch(API + '/api/autoscale/status').then((r) => r.json()),
          fetch(API + '/api/logs').then((r) => r.json()),
        ]);
        setProfiles((p ?? []).map(toProfile)); setReplicas(s.replicas); setAutoscaleState(a.enabled); setLogs(lg ?? []);
      } catch {
        setMode('local');
      }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [mode]);

  const setAutoscale = async (on: boolean) => {
    if (mode === 'local') { local.current.autoscale = on; setAutoscaleState(on); return; }
    await post(`/api/autoscale/${on ? 'enable' : 'disable'}`).catch(() => {});
    setAutoscaleState(on);
  };

  const resetAll = async () => {
    setCalmOn(false); setNoisyOn(false);
    for (const w of [...CALM, NOISY]) {
      if (mode === 'local') local.current.reset(w.key);
      else await post('/api/reset-profile', { workload_key: w.key }).catch(() => {});
    }
  };

  return { mode, calmOn, setCalmOn, noisyOn, setNoisyOn, profiles, replicas, autoscale, setAutoscale, logs, resetAll };
}
