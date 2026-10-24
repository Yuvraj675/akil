import { useMemo, useState } from 'react';
import { Check, Play, Square, RotateCcw, Zap } from 'lucide-react';
import { useCluster, NODES, CALM, NOISY, CANDIDATE, API, type WorkloadSpec } from '../lib/cluster';
import { score, WEIGHTS, type Profile, type ScoreResult } from '../lib/scorer';
import { Button, SignalBar, SIGNALS, type SignalId } from '../components/ui';

interface Decision {
  id: number;
  noisyPresent: boolean;
  defaultPick: string;
  akilPick: string;
  rows: { node: string; freeCpu: number; defaultScore: number; akil: ScoreResult; residents: string[] }[];
}

const NOISY_WARM = 300_000; // cache misses/s at which cache-stress's profile is clearly visible

export default function LiveDemo() {
  const c = useCluster();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const byKey = useMemo(() => new Map(c.profiles.map((p) => [p.key, p])), [c.profiles]);

  // A workload counts as resident while it runs or while its profile is still draining out of the window.
  const residents = (node: string) =>
    [...CALM, NOISY].filter((w) => w.node === node && (isOn(w) || (byKey.get(w.key)?.samples ?? 0) > 0));
  const isOn = (w: WorkloadSpec) => (w === NOISY ? c.noisyOn : c.calmOn);

  const noisyProfile = byKey.get(NOISY.key);
  const noisyWarm = (noisyProfile?.cacheMissRate ?? 0) > NOISY_WARM;
  // Once cache-stress has been seen at full strength, step 3 stays done even after it is stopped.
  const [sawNoisy, setSawNoisy] = useState(false);
  if (c.noisyOn && noisyWarm && !sawNoisy) setSawNoisy(true);

  const schedule = () => {
    const rows = NODES.map((n) => {
      const res = residents(n.name);
      const used = res.reduce((a, w) => a + w.cpuRequest, 0);
      const colocated = res.map((w) => byKey.get(w.key)).filter((p): p is Profile => !!p && p.samples > 0);
      return {
        node: n.name,
        freeCpu: n.cpu - used,
        // kube-scheduler's NodeResourcesFit (LeastAllocated): prefer the emptiest node by requests
        defaultScore: Math.round(((n.cpu - used - CANDIDATE.cpuRequest) / n.cpu) * 100),
        akil: score(CANDIDATE, colocated),
        residents: res.map((w) => w.name),
      };
    });
    const best = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, b) => (f(b) > f(a) ? b : a)).node;
    setDecisions((d) => [{
      id: Date.now(),
      noisyPresent: rows.some((r) => r.residents.includes(NOISY.name)),
      defaultPick: best((r) => r.defaultScore),
      akilPick: best((r) => r.akil.score * 1000 + r.defaultScore), // ties broken by free CPU
      rows,
    }, ...d].slice(0, 6));
  };

  const latest = decisions[0];
  const steps = [
    { done: c.calmOn, title: 'Start the cluster', say: 'Two ordinary workloads start on node-2 and node-3. eBPF probes begin streaming their kernel behaviour.',
      action: <Button onClick={() => c.setCalmOn(true)} disabled={c.calmOn}><Play size={16} />Start workloads</Button> },
    { done: decisions.some((d) => !d.noisyPresent), title: 'Schedule a web pod on a quiet cluster', say: 'With no troublemaker around, AKIL and the default scheduler agree. AKIL stays out of the way.',
      action: <Button onClick={schedule} disabled={!c.calmOn}>Schedule web-frontend</Button> },
    { done: sawNoisy, title: 'Unleash a noisy neighbour on node-1', say: 'cache-stress requests only a tenth of a core, so to Kubernetes node-1 still looks the emptiest. Watch its kernel signals climb as the 12-second window fills.',
      action: <Button variant="danger" onClick={() => c.setNoisyOn(true)} disabled={c.noisyOn}><Zap size={16} />Start cache-stress</Button> },
    { done: decisions.some((d) => d.noisyPresent && d.defaultPick !== d.akilPick), title: 'Schedule the web pod again', say: 'The default scheduler still picks node-1 because it has the most free CPU. AKIL sees the cache and lock pressure and steers away.',
      action: <Button onClick={schedule} disabled={!c.noisyOn}>Schedule web-frontend</Button> },
    { done: c.logs.some((l) => l.action === 'SCALE DOWN') && !c.noisyOn, title: 'Watch the autoscaler, then calm things down', say: 'The same telemetry drives scaling: replicas go up while contention lasts. Stop cache-stress and they come back down once its profile drains.',
      action: <Button variant="quiet" onClick={() => c.setNoisyOn(false)} disabled={!c.noisyOn}><Square size={14} />Stop cache-stress</Button> },
  ];
  const nextStep = steps.findIndex((s) => !s.done);

  return (
    <div className="space-y-6">
      <ModeBanner mode={c.mode} />

      <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* Presenter script */}
        <aside className="bg-surface border border-line rounded-2xl p-5 lg:sticky lg:top-24">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Demo script</h2>
            <button onClick={() => { c.resetAll(); setDecisions([]); setSawNoisy(false); }} className="text-sm text-muted hover:text-ink inline-flex items-center gap-1">
              <RotateCcw size={14} />Reset
            </button>
          </div>
          <ol className="space-y-1">
            {steps.map((s, i) => {
              const current = i === nextStep;
              return (
                <li key={i} className={`rounded-xl p-3 transition-colors ${current ? 'bg-paper' : ''}`}>
                  <div className="flex gap-3">
                    <span className={`shrink-0 grid place-items-center w-6 h-6 rounded-full text-xs font-semibold ${s.done ? 'bg-good text-white' : current ? 'bg-ink text-white' : 'border border-line text-muted'}`}>
                      {s.done ? <Check size={14} /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`font-medium leading-snug ${s.done && !current ? 'text-muted' : ''}`}>{s.title}</p>
                      {current && (
                        <>
                          <p className="text-sm text-muted mt-1.5 leading-relaxed">{s.say}</p>
                          <div className="mt-3">{s.action}</div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {nextStep === -1 && <p className="mt-3 text-sm text-good font-medium">Demo complete. Press Reset to run it again.</p>}
        </aside>

        <div className="space-y-6 min-w-0">
          {/* Cluster */}
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <div>
                <h2 className="text-xl font-semibold">The cluster</h2>
                <p className="text-muted text-sm">Grey bar: CPU requested, the only thing kube-scheduler looks at. Coloured bars: what the kernel actually sees, live from eBPF.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => c.setCalmOn(!c.calmOn)}>{c.calmOn ? 'Stop' : 'Start'} background workloads</Button>
                <Button variant={c.noisyOn ? 'quiet' : 'danger'} onClick={() => c.setNoisyOn(!c.noisyOn)}>{c.noisyOn ? 'Stop' : 'Start'} cache-stress</Button>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {NODES.map((n) => (
                <NodeCard key={n.name} name={n.name} cpu={n.cpu} residents={residents(n.name)} byKey={byKey} isOn={isOn}
                  placed={latest?.akilPick === n.name ? latest.id : undefined}
                  ghost={latest && latest.defaultPick !== latest.akilPick && latest.defaultPick === n.name} />
              ))}
            </div>
          </section>

          {/* Decision */}
          <section className="bg-surface border border-line rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Where should web-frontend go?</h2>
                <p className="text-muted text-sm">A latency-sensitive web pod requesting 0.1 cores. Its kernel profile is already known from earlier replicas.</p>
              </div>
              <Button onClick={schedule} disabled={!c.calmOn && !c.noisyOn}>Schedule web-frontend</Button>
            </div>
            {latest ? <DecisionView d={latest} /> : (
              <p className="mt-5 text-muted border border-dashed border-line rounded-xl p-6 text-center">
                Start the workloads, then schedule the pod to compare both schedulers' choices.
              </p>
            )}
          </section>

          {/* Autoscaler */}
          <Autoscaler replicas={c.replicas} enabled={c.autoscale} onToggle={c.setAutoscale} logs={c.logs} />
        </div>
      </div>
    </div>
  );
}

function ModeBanner({ mode }: { mode: 'connecting' | 'live' | 'local' }) {
  if (mode === 'connecting') return <p className="text-sm text-muted">Connecting to the AKIL aggregator…</p>;
  if (mode === 'live') return (
    <p className="text-sm flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-good" />
      Live: telemetry is processed by the real Go aggregator at <code className="font-mono">{API}</code> (sliding window, profile store, autoscaler).
    </p>
  );
  return (
    <p className="text-sm bg-[#fff6e5] border border-[#f0d9a8] rounded-lg px-3 py-2">
      The aggregator isn't reachable at <code className="font-mono">{API}</code>, so the same algorithms are running in your browser instead.
      To run it for real, start it with <code className="font-mono">make demo</code> and reload.
    </p>
  );
}

const SIGNAL_MAX: Record<SignalId, number> = { cache: 1e6, lock: 1, pageFault: 1e4, ctxSwitch: 1e4 };

function NodeCard({ name, cpu, residents, byKey, isOn, placed, ghost }: {
  name: string; cpu: number; residents: WorkloadSpec[]; byKey: Map<string, Profile>; isOn: (w: WorkloadSpec) => boolean;
  placed?: number; ghost?: boolean;
}) {
  const used = residents.reduce((a, w) => a + w.cpuRequest, 0);
  const noisy = residents.includes(NOISY);
  return (
    <div className={`bg-surface rounded-2xl border p-4 transition-colors ${noisy ? 'border-bad' : 'border-line'}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold font-mono">{name}</h3>
        <span className="text-sm text-muted tabular">{((cpu - used) / 1000).toFixed(1)} of {cpu / 1000} cores free</span>
      </div>
      <div className="h-2 rounded-full bg-paper mt-2 overflow-hidden">
        <div className="h-full bg-[#9aa5b3] transition-[width] duration-500" style={{ width: `${(used / cpu) * 100}%` }} />
      </div>

      <div className="mt-4 space-y-4 min-h-[7rem]">
        {residents.length === 0 && <p className="text-sm text-muted">Empty</p>}
        {residents.map((w) => {
          const p = byKey.get(w.key);
          return (
            <div key={w.key}>
              <p className="text-sm font-medium flex items-center gap-2">
                <span className={w === NOISY ? 'text-bad' : ''}>{w.name}</span>
                <span className="text-muted font-normal">{w.cpuRequest / 1000} cores</span>
                {!isOn(w) && <span className="text-muted font-normal">stopped, draining</span>}
              </p>
              <div className="mt-1.5 space-y-1">
                <SignalBar id="cache" value={p?.cacheMissRate ?? 0} max={SIGNAL_MAX.cache} />
                <SignalBar id="lock" value={p?.lockRatio ?? 0} max={SIGNAL_MAX.lock} />
                <SignalBar id="pageFault" value={p?.pageFaultRate ?? 0} max={SIGNAL_MAX.pageFault} />
                <SignalBar id="ctxSwitch" value={p?.ctxSwitchRate ?? 0} max={SIGNAL_MAX.ctxSwitch} />
              </div>
            </div>
          );
        })}
        {placed && (
          <div key={placed} className="land rounded-lg border-2 border-good bg-[#eaf6ee] px-3 py-2 text-sm font-medium">
            web-frontend <span className="font-normal text-muted">placed by AKIL</span>
          </div>
        )}
        {ghost && (
          <div className="rounded-lg border-2 border-dashed border-bad px-3 py-2 text-sm text-bad">
            Default kube-scheduler would have put web-frontend here
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionView({ d }: { d: Decision }) {
  const agree = d.defaultPick === d.akilPick;
  const defaultRow = d.rows.find((r) => r.node === d.defaultPick)!;
  const akilRow = d.rows.find((r) => r.node === d.akilPick)!;
  return (
    <div className="mt-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Verdict tone={agree ? 'neutral' : 'bad'} who="Default kube-scheduler" node={d.defaultPick}
          why={`Most free CPU: ${(defaultRow.freeCpu / 1000).toFixed(1)} cores. It can't see anything else.`} />
        <Verdict tone="good" who="AKIL" node={d.akilPick}
          why={`Best score: ${akilRow.akil.score} / 100, where 100 means no expected interference.`} />
      </div>

      {!agree && d.noisyPresent && (
        <p className="text-[15px] leading-relaxed max-w-3xl">
          Here the other nodes are quiet, so AKIL's choice is easy. When every node has some noisy neighbour, the current
          penalty model can prefer the cache-stress node. The Results chapter shows that case.
        </p>
      )}
      {agree && <p className="text-[15px] text-muted">Both schedulers agree. Without a noisy neighbour, AKIL's penalties are near zero and it doesn't change anything.</p>}

      <div>
        <h3 className="font-medium mb-2">How AKIL scored each node</h3>
        <p className="text-sm text-muted mb-3">Every node starts at 100. Each resident workload subtracts a penalty per signal, weighted cache {WEIGHTS.cache}, locks {WEIGHTS.lock}, page faults {WEIGHTS.pageFault}, context switches {WEIGHTS.ctxSwitch}.</p>
        <div className="space-y-2.5">
          {d.rows.map((r) => <ScoreRow key={r.node} r={r} chosen={r.node === d.akilPick} />)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted">
          {(Object.keys(SIGNALS) as SignalId[]).map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SIGNALS[id].color }} />{SIGNALS[id].label} penalty</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Verdict({ tone, who, node, why }: { tone: 'good' | 'bad' | 'neutral'; who: string; node: string; why: string }) {
  const border = { good: 'border-good', bad: 'border-bad', neutral: 'border-line' }[tone];
  return (
    <div className={`rounded-xl border-2 ${border} p-4`}>
      <p className="text-sm text-muted">{who} picks</p>
      <p className={`text-3xl font-semibold font-mono mt-0.5 ${tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : ''}`}>{node}</p>
      <p className="text-sm mt-2 leading-relaxed">{why}</p>
    </div>
  );
}

function ScoreRow({ r, chosen }: { r: Decision['rows'][number]; chosen: boolean }) {
  const parts: [SignalId, number][] = [['cache', r.akil.cache], ['lock', r.akil.lock], ['pageFault', r.akil.pageFault], ['ctxSwitch', r.akil.ctxSwitch]];
  return (
    <div className="grid grid-cols-[4.5rem_1fr_3rem] sm:grid-cols-[5rem_1fr_3.5rem] items-center gap-3">
      <span className={`font-mono text-sm ${chosen ? 'font-semibold' : 'text-muted'}`}>{r.node}</span>
      <div className="h-6 rounded-md bg-paper flex overflow-hidden" title={r.residents.join(', ') || 'empty'}>
        <div className={`h-full ${chosen ? 'bg-ink' : 'bg-[#9aa5b3]'}`} style={{ width: `${r.akil.score}%` }} />
        {parts.map(([id, v]) => v > 0.05 && (
          <div key={id} className="h-full opacity-80" style={{ width: `${Math.min(v, 100)}%`, background: SIGNALS[id].color }} title={`${SIGNALS[id].label}: −${v.toFixed(1)}`} />
        ))}
      </div>
      <span className="font-mono tabular text-right font-semibold">{r.akil.score}</span>
    </div>
  );
}

function Autoscaler({ replicas, enabled, onToggle, logs }: {
  replicas: number; enabled: boolean; onToggle: (on: boolean) => void; logs: { timestamp: string; action: string; reason: string; replicas: number }[];
}) {
  const recent = logs.filter((l) => l.replicas > 0).slice(-4).reverse();
  return (
    <section className="bg-surface border border-line rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Telemetry-driven autoscaler</h2>
          <p className="text-muted text-sm max-w-2xl">Checks every workload profile every 3 seconds. Any hot signal adds a replica (up to 6). When everything is calm it removes one.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-[var(--color-ink)]" />
          Autoscaling on
        </label>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex gap-1.5" aria-label={`${replicas} replicas`}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`w-7 h-9 rounded-md border-2 transition-colors ${i < replicas ? 'bg-ink border-ink' : 'border-line border-dashed'}`} />
          ))}
        </div>
        <p><span className="text-2xl font-semibold font-mono tabular">{replicas}</span> <span className="text-muted">replicas</span></p>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm">
        {recent.length === 0 && <li className="text-muted">No scaling decisions yet.</li>}
        {recent.map((l, i) => (
          <li key={l.timestamp + i} className="flex gap-3">
            <span className="font-mono text-muted tabular shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
            <span className={`shrink-0 font-medium ${l.action === 'SCALE UP' ? 'text-bad' : 'text-good'}`}>{l.action === 'SCALE UP' ? 'Up' : 'Down'} to {l.replicas}</span>
            <span className="text-muted truncate">{l.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
