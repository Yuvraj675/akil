import { SIGNALS, type SignalId } from '../components/ui';
import { WEIGHTS } from '../lib/scorer';

const LAYERS = [
  { where: 'Linux kernel, every node', name: 'eBPF probes', what: 'Small sandboxed programs on hardware counters and kernel tracepoints. Each event is tagged with the container’s cgroup.', file: 'pkg/ebpf/akil.c', cost: 'overhead not yet measured' },
  { where: 'DaemonSet, every node', name: 'Collector', what: 'Reads events from a 16 MB ring buffer, maps each cgroup to its pod, and streams batches every second.', file: 'cmd/collector', cost: 'batches of 100 events or 1 s' },
  { where: 'Control plane', name: 'Aggregator', what: 'Keeps a sliding window per workload (12 buckets) and turns it into rates: a runtime profile.', file: 'pkg/profile', cost: '0.29–0.54 ms per Score() call (loopback)' },
  { where: 'Inside kube-scheduler', name: 'Score plugin', what: 'For each candidate node, fetches the profiles of the pods already there and subtracts interference penalties from 100.', file: 'pkg/scoring', cost: 'scoring maths under 1.9 µs' },
];

export default function HowItWorks() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="hero-head">Four pieces close the loop from kernel to scheduler.</h1>
        <p className="lead mt-5 text-ink-2">
          Nothing in the application changes and the kernel isn’t modified. AKIL plugs into extension points that already exist.
        </p>
      </div>

      <ol className="panels md:grid-cols-4">
        {LAYERS.map((l, i) => (
          <li key={l.name} className="p-5 flex flex-col">
            <span className="text-sm text-muted"><span className="measured">{i + 1}</span> {l.where}</span>
            <h2 className="text-xl mt-2">{l.name}</h2>
            <p className="mt-3 text-ink-2">{l.what}</p>
            <p className="text-sm text-muted mt-auto pt-5">{l.cost}</p>
            <code className="measured text-sm text-muted mt-1">{l.file}</code>
          </li>
        ))}
      </ol>

      <section className="panels md:grid-cols-2">
        <div className="p-6">
          <h2 className="text-xl">The four signals</h2>
          <ul className="mt-5 space-y-4">
            {(Object.keys(SIGNALS) as SignalId[]).map((id) => (
              <li key={id} className="grid grid-cols-[4px_1fr] gap-3">
                <span className="rounded-full" style={{ background: SIGNALS[id].color }} />
                <div>
                  <p className="font-medium">{SIGNALS[id].label}</p>
                  <p className="text-sm text-muted">{SIGNALS[id].plain}</p>
                  <code className="measured text-sm text-muted">{SIGNALS[id].source}</code>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-6">
          <h2 className="text-xl">The score</h2>
          <p className="text-muted mt-1 text-sm">For a pod <em>c</em> considering a node with residents <em>p</em>:</p>
          <pre className="measured mt-4 text-sm leading-7 bg-paper-3 border border-line rounded-card p-4 overflow-x-auto">{`score = 100 − Σ over residents p (
   ${WEIGHTS.cache} × cache_p / 1M
 + ${WEIGHTS.lock} × (lock_c + lock_p)
 + ${WEIGHTS.pageFault} × (faults_c + faults_p) / 10k
 + ${WEIGHTS.ctxSwitch} × (switches_c + switches_p) / 10k )`}</pre>
          <ul className="mt-5 space-y-2 text-sm text-ink-2">
            <li><strong className="font-medium text-ink">Cache uses the neighbour’s rate:</strong> a thrashing neighbour evicts everyone’s lines, however cache-friendly the newcomer is.</li>
            <li><strong className="font-medium text-ink">Others use the sum:</strong> lock and scheduler pressure add up regardless of who causes it.</li>
            <li><strong className="font-medium text-ink">Unsure? Back off.</strong> Penalties scale with profile confidence (×0.25 with few samples). A brand-new pod is scored as a quiet one, so its neighbours’ pressure still counts.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
