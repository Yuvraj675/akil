import { SIGNALS, type SignalId } from '../components/ui';
import { WEIGHTS } from '../lib/scorer';

const LAYERS = [
  { where: 'Linux kernel, every node', name: 'eBPF probes', what: 'Tiny sandboxed programs hooked into hardware counters and kernel tracepoints. They tag every event with the container’s cgroup.', file: 'pkg/ebpf/akil.c', cost: 'overhead not yet measured' },
  { where: 'DaemonSet, every node', name: 'Collector', what: 'Reads events from a 16 MB ring buffer, works out which pod each cgroup belongs to, and streams batches every second.', file: 'cmd/collector', cost: 'batches of 1000 events or 1 s' },
  { where: 'Control plane', name: 'Aggregator', what: 'Keeps a sliding window of recent behaviour per workload (12 buckets) and turns it into rates: a runtime profile.', file: 'pkg/profile', cost: '0.12–0.28 ms per Score() call (loopback)' },
  { where: 'Inside kube-scheduler', name: 'Score plugin', what: 'For each candidate node, fetches the profiles of pods already there and subtracts interference penalties from 100.', file: 'pkg/scoring', cost: 'scoring math under 0.5 µs' },
];

export default function HowItWorks() {
  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl font-semibold tracking-tight leading-tight max-w-3xl">
        Four small pieces close the loop from kernel to scheduler.
      </h1>
      <p className="mt-4 text-lg text-muted max-w-2xl leading-relaxed">
        Nothing in the application changes, and the kernel isn't modified. AKIL only plugs into extension points that already exist.
      </p>

      <ol className="mt-10 grid md:grid-cols-4 gap-4">
        {LAYERS.map((l, i) => (
          <li key={l.name} className="relative bg-surface border border-line rounded-2xl p-5">
            <span className="text-sm text-muted">{i + 1}. {l.where}</span>
            <h3 className="text-xl font-semibold mt-1">{l.name}</h3>
            <p className="text-[15px] mt-2 leading-relaxed">{l.what}</p>
            <p className="text-sm text-muted mt-3">{l.cost}</p>
            <code className="block font-mono text-xs text-muted mt-1">{l.file}</code>
            {i < LAYERS.length - 1 && <span aria-hidden className="hidden md:block absolute -right-3.5 top-1/2 -translate-y-1/2 text-muted text-lg">›</span>}
          </li>
        ))}
      </ol>

      <section className="mt-8 grid md:grid-cols-2 gap-6">
        <div className="bg-surface border border-line rounded-2xl p-6">
          <h2 className="text-xl font-semibold">The four signals</h2>
          <ul className="mt-4 space-y-4">
            {(Object.keys(SIGNALS) as SignalId[]).map((id) => (
              <li key={id} className="flex gap-3">
                <span className="w-1 rounded-full shrink-0" style={{ background: SIGNALS[id].color }} />
                <div>
                  <p className="font-medium">{SIGNALS[id].label}</p>
                  <p className="text-sm text-muted">{SIGNALS[id].plain}</p>
                  <code className="font-mono text-xs text-muted">{SIGNALS[id].source}</code>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6">
          <h2 className="text-xl font-semibold">The score</h2>
          <p className="text-muted mt-1 text-sm">For a pod <em>c</em> considering a node with residents <em>p</em>:</p>
          <pre className="mt-4 font-mono text-[13px] leading-7 bg-paper rounded-xl p-4 overflow-x-auto">{`score = 100 − Σ over residents p (
   ${WEIGHTS.cache} × min(cache_c, cache_p) / 1M
 + ${WEIGHTS.lock} × (lock_c + lock_p)
 + ${WEIGHTS.pageFault} × (faults_c + faults_p) / 10k
 + ${WEIGHTS.ctxSwitch} × (switches_c + switches_p) / 10k )`}</pre>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed">
            <li><strong>Cache uses min:</strong> two pods only thrash each other if both are cache-hungry.</li>
            <li><strong>Others use sum:</strong> lock and scheduler pressure add up regardless of who causes it.</li>
            <li><strong>Unsure? Back off.</strong> Penalties are scaled by profile confidence (×0.25 with few samples), and a pod with no profile gets a neutral 50.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
