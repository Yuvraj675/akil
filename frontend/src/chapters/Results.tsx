import live from '../lib/live_summary.json';

// Measured: deploy/experiment/run.sh → scripts/summarize_live_runs.py → lib/live_summary.json.
// Modelled: evidence/processed_data/ (scripts/run_evidence_simulations.py, 10 seeds, 5 simulated nodes).

type Stat = { mean: number; ci95: number };
type Group = { trials: number; p50_ms: Stat; p99_ms: Stat; placements?: Record<string, number> };
const pinned = live.pinned as Record<string, Group>;
const placed = live.placed as Record<string, Group>;

const PINNED_ROWS = [
  { key: 'isolated', label: 'Alone on a node' },
  { key: 'lock-stress', label: 'Next to lock-stress' },
  { key: 'batch-worker', label: 'Next to batch-worker' },
  { key: 'cache-stress', label: 'Next to cache-stress' },
];

const MODELLED = [
  { name: 'Alone on a node', p99: 17.53, ci: 0.05 },
  { name: 'AKIL', p99: 49.74, ci: 1.46 },
  { name: 'Default kube-scheduler', p99: 62.68, ci: 4.58 },
  { name: 'Trimaran TargetLoadPacking', p99: 254.58, ci: 8.49 },
  { name: 'BinPacking (MostAllocated)', p99: 260.6, ci: 6.44 },
];

function share(g: Group, needle: string) {
  const total = Object.values(g.placements ?? {}).reduce((a, b) => a + b, 0);
  const hit = Object.entries(g.placements ?? {}).filter(([k]) => k.includes(needle)).reduce((a, [, n]) => a + n, 0);
  return `${hit} of ${total}`;
}

export default function Results() {
  const def = placed['default-scheduler'];
  const akil = placed['akil-scheduler'];
  const maxP99 = Math.max(...PINNED_ROWS.map((r) => pinned[r.key].p99_ms.mean + pinned[r.key].p99_ms.ci95), def.p99_ms.mean, akil.p99_ms.mean);

  return (
    <div className="space-y-12">
      <div>
        <h1 className="hero-head">AKIL finds the noisy neighbour. Latency needs calibrated weights.</h1>
        <p className="lead mt-5 text-ink-2">
          Measured on a live four-node cluster with real stress-ng neighbours, 1,200 requests per trial.
        </p>
      </div>

      {/* The record: where each scheduler put the web pod. */}
      <section className="panels md:grid-cols-2">
        <Reading who="Default kube-scheduler" value={share(def, 'cache-stress')} line="placements next to cache-stress"
          note="Its node looked the emptiest: cache-stress declares 100m CPU." tone="bad" />
        <Reading who="AKIL" value={share(akil, 'cache-stress')} line="placements next to cache-stress"
          note="It read 8–14 M cache misses/s from the kernel and scored that node 0." tone="ok" />
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl">What each placement cost, in measured p99 latency</h2>
          <p className="text-muted mt-2 max-w-[65ch]">
            Mean ± 95% CI. The pinned rows show the price of each neighbour. AKIL avoided cache-stress but chose the
            batch-worker node, which costs this service just as much; the lock-stress node was the safe one.
          </p>
        </div>
        <div className="panels">
          {PINNED_ROWS.map((r) => <Bar key={r.key} label={r.label} sub={`pinned, ${pinned[r.key].trials} trials`} g={pinned[r.key]} max={maxP99} />)}
          <Bar label="Default kube-scheduler" sub={`placed, ${def.trials} trials`} g={def} max={maxP99} />
          <Bar label="AKIL" sub={`placed, ${akil.trials} trials`} g={akil} max={maxP99} lead />
        </div>
        <p className="text-sm text-muted">
          Median: <span className="measured">{def.p50_ms.mean.toFixed(1)} ms</span> default, <span className="measured">{akil.p50_ms.mean.toFixed(1)} ms</span> AKIL.
          The nodes share one 18 MiB L3 cache, which narrows the gap avoiding cache-stress can buy.
        </p>
      </section>

      <section className="panels md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="p-6">
          <h2 className="text-xl">Modelled, not measured: the 5-node simulation</h2>
          <p className="text-sm text-muted mt-1">
            AKIL’s exact scoring code, 10 seeds, latency from literature interference coefficients. p99 ± 95% CI.
          </p>
          <table className="w-full mt-5 text-sm">
            <thead>
              <tr className="text-muted text-left"><th className="font-medium pb-2">Scheduler</th><th className="font-medium pb-2 text-right">p99 ms</th></tr>
            </thead>
            <tbody>
              {MODELLED.map((m) => (
                <tr key={m.name} className="border-t border-line">
                  <td className={`py-2 ${m.name === 'AKIL' ? 'text-ink' : 'text-ink-2'}`}>{m.name}</td>
                  <td className="py-2 text-right measured">{m.p99.toFixed(1)} ±{m.ci}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6">
          <h2 className="text-xl">Cost per scoring call</h2>
          <p className="reading mt-5 text-[length:var(--text-3xl)]">0.9 ms</p>
          <p className="text-sm text-muted mt-2">Two gRPC queries in-cluster, median. Tail 3.3 ms; scoring arithmetic under 1.9 µs.</p>
          <p className="text-sm text-ink-2 mt-4">
            Scoring three nodes in parallel against a busy aggregator broke the 5 ms budget, so the live run uses 25 ms.
          </p>
        </div>
      </section>

      <p className="text-sm text-muted">
        Raw data: <code className="measured">evidence/raw_data/live_cluster_runs.csv</code> and{' '}
        <code className="measured">evidence/processed_data/</code>. Reproduce with <code className="measured">deploy/experiment/run.sh</code>.
      </p>
    </div>
  );
}

function Reading({ who, value, line, note, tone }: { who: string; value: string; line: string; note: string; tone: 'ok' | 'bad' }) {
  return (
    <div className="p-6">
      <p className="text-sm text-muted">{who}</p>
      <p className={`reading mt-3 ${tone === 'ok' ? 'text-ok' : 'text-bad'}`}>{value}</p>
      <p className="mt-2 text-ink-2">{line}</p>
      <p className="text-sm text-muted mt-3">{note}</p>
    </div>
  );
}

function Bar({ label, sub, g, max, lead }: { label: string; sub: string; g: Group; max: number; lead?: boolean }) {
  const s = g.p99_ms;
  return (
    <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-[14rem_minmax(0,1fr)_9rem] gap-2 sm:gap-5 items-center">
      <div>
        <p className={lead ? 'text-ink font-medium' : 'text-ink-2'}>{label}</p>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      <div className="relative h-3 rounded-full bg-track">
        <div className={`absolute inset-y-0 left-0 rounded-full ${lead ? 'bg-cool' : 'bg-requested'}`} style={{ width: `${(s.mean / max) * 100}%` }} />
        <div className="absolute top-1/2 h-px bg-ink-2" style={{ left: `${(Math.max(0, s.mean - s.ci95) / max) * 100}%`, width: `${(Math.min(2 * s.ci95, max) / max) * 100}%` }} />
      </div>
      <p className="measured sm:text-right">{s.mean.toFixed(1)} <span className="text-muted">±{s.ci95.toFixed(1)} ms</span></p>
    </div>
  );
}
