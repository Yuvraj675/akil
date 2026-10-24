import { SignalBar } from '../components/ui';
import { Button } from '../components/ui';

const PODS = [
  { name: 'web-frontend', note: 'Serves user requests. Needs its cache data to stay warm.', cache: 120_000, lock: 0.04, pf: 350, cs: 2500 },
  { name: 'cache-stress', note: 'Sweeps a 512 MB array, evicting everyone else’s cache lines.', cache: 900_000, lock: 0.08, pf: 1200, cs: 4000 },
];

export default function Problem({ onNext }: { onNext: () => void }) {
  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.08] max-w-3xl">
        Two pods can ask for the same resources and behave nothing alike.
      </h1>
      <p className="mt-5 text-lg text-muted max-w-2xl leading-relaxed">
        Kubernetes places pods using only the CPU and memory they request. It can't see how a pod actually uses the
        machine, so it happily puts a well-behaved service next to one that wrecks the shared CPU cache.
      </p>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        {PODS.map((p) => (
          <div key={p.name} className="bg-surface border border-line rounded-2xl p-5">
            <h3 className="font-mono font-semibold text-lg">{p.name}</h3>
            <p className="text-sm text-muted mt-1">{p.note}</p>
            <div className="mt-4 rounded-xl bg-paper p-3">
              <p className="text-sm font-medium">What Kubernetes sees</p>
              <p className="font-mono text-sm mt-1">requests: cpu 100m, memory 128Mi</p>
            </div>
            <div className="mt-3 rounded-xl border border-line p-3">
              <p className="text-sm font-medium mb-2">What the Linux kernel sees</p>
              <div className="space-y-1">
                <SignalBar id="cache" value={p.cache} max={1e6} />
                <SignalBar id="lock" value={p.lock} max={1} />
                <SignalBar id="pageFault" value={p.pf} max={1e4} />
                <SignalBar id="ctxSwitch" value={p.cs} max={1e4} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid sm:grid-cols-3 gap-6 max-w-5xl">
        <Point title="The cost" text="In our model, the default scheduler's placements push web-frontend's p99 latency from 17.5 ms alone to 62.7 ms." />
        <Point title="The idea" text="Measure those four kernel signals per workload with eBPF, and let the scheduler use them when placing pods." />
        <Point title="The constraint" text="No changes to apps or the kernel, and only a fraction of a millisecond added to each scheduling decision." />
      </div>

      <div className="mt-10">
        <Button onClick={onNext}>See it live</Button>
      </div>
    </div>
  );
}

function Point({ title, text }: { title: string; text: string }) {
  return (
    <div className="border-t-2 border-ink pt-3">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-muted mt-1 leading-relaxed">{text}</p>
    </div>
  );
}
