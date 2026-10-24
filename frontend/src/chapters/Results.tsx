// Numbers from evidence/processed_data/ (scripts/run_evidence_simulations.py: 10 seeds, 5-node simulated cluster).
// Latency and cache-miss figures are model outputs, not hardware measurements.

const STRATEGIES = [
  { name: 'Alone on a node', note: 'Best case, no neighbours', p99: 17.53, ci: 0.05, coloc: null, kind: 'ref' },
  { name: 'Default kube-scheduler', note: 'Places by CPU and memory only', p99: 62.68, ci: 4.58, coloc: 36.0, kind: 'base' },
  { name: 'AKIL', note: 'Kernel-signal penalty score', p99: 48.89, ci: 2.24, coloc: 46.2, kind: 'akil' },
  { name: 'Reactive descheduler', note: 'Moves pods after the fact, 882 evictions', p99: 29.52, ci: 1.54, coloc: 0.7, kind: 'base' },
  { name: 'Static anti-affinity', note: 'Hand-written rules; 0.19% of pods left pending', p99: 26.2, ci: 0.24, coloc: 0.0, kind: 'base' },
] as const;

export default function Results() {
  const maxP99 = 70;
  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl font-semibold tracking-tight leading-tight max-w-3xl">
        AKIL cuts tail latency by 22% over the default scheduler, but simpler approaches still do better.
      </h1>
      <p className="mt-4 text-lg text-muted max-w-2xl leading-relaxed">
        A simulated 5-node cluster runs AKIL's exact scoring code against three alternatives over 10 random seeds.
        Latency comes from an interference model applied to where each scheduler placed the pods. It isn't measured on hardware.
      </p>

      <section className="mt-10 bg-surface border border-line rounded-2xl p-6">
        <h2 className="text-xl font-semibold">p99 latency of the web service</h2>
        <p className="text-sm text-muted">The slowest 1% of requests, mean ± 95% CI. Lower is better. Dashed line: 15 ms target.</p>
        <div className="mt-6 space-y-4">
          {STRATEGIES.map((s) => (
            <div key={s.name} className="grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-1 sm:gap-4 items-center">
              <div>
                <p className={`font-medium ${s.kind === 'akil' ? 'text-cache' : ''}`}>{s.name}</p>
                <p className="text-xs text-muted">{s.note}</p>
              </div>
              <div className="relative h-8 flex items-center gap-2">
                <div className={`h-full rounded-md ${s.kind === 'akil' ? 'bg-cache' : s.kind === 'ref' ? 'bg-[#c9d0d9]' : 'bg-[#9aa5b3]'}`}
                  style={{ width: `${(s.p99 / maxP99) * 85}%` }} />
                <span className="text-sm font-mono font-semibold tabular whitespace-nowrap">{s.p99.toFixed(1)} <span className="font-normal text-muted">±{s.ci}</span> ms</span>
                <div className="absolute inset-y-[-4px] border-l-2 border-dashed border-ink/40" style={{ left: `${(15 / maxP99) * 85}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        <Stat value="46%" label="Web pods placed next to cache-stress" detail="Default scheduler: 36%. AKIL does this more often, not less. See below for why." />
        <Stat value="−9%" label="Context-switch load on the web pod’s node" detail="AKIL does move lock- and fault-heavy neighbours away: 11.2k → 10.2k switches/s." />
        <Stat value="0.12–0.28 ms" label="Measured cost per scoring call" detail="Two gRPC queries to the aggregator, over loopback. The scoring math is under 0.5 µs." />
      </div>

      <section className="mt-6 bg-surface border border-line rounded-2xl p-6">
        <h2 className="text-xl font-semibold">What we found wrong with the score</h2>
        <p className="mt-2 leading-relaxed max-w-3xl">
          The cache penalty uses <code className="font-mono text-sm">min(candidate, neighbour)</code>. A neighbour causing
          900k misses/s is charged the same as one causing 120k/s, because the cap is the web pod's own rate.
          cache-stress is otherwise quiet, so its node scores <strong>79</strong>, higher than a lock-heavy node (55) or a
          page-fault-heavy node (71). Across 50 weight settings AKIL ranks the cache-stress node first 80% of the time.
        </p>
        <p className="mt-3 text-muted leading-relaxed max-w-3xl">
          Charging the neighbour's own miss rate instead drops co-location from 46% to 28%, but p99 stays around 50 ms.
          Fixing that one term is necessary but not enough. The penalty model needs rethinking, and the results need validating on real hardware.
        </p>
      </section>

      <p className="mt-6 text-sm text-muted">Raw data, confidence intervals and the simulator: <code className="font-mono">evidence/</code> and <code className="font-mono">scripts/run_evidence_simulations.py</code>.</p>
    </div>
  );
}

function Stat({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-5">
      <p className="text-3xl font-semibold font-mono tabular">{value}</p>
      <p className="font-medium mt-1">{label}</p>
      <p className="text-sm text-muted mt-1 leading-relaxed">{detail}</p>
    </div>
  );
}
