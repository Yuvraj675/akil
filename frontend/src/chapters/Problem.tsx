import { SignalBar } from '../components/ui';
import { Button } from '../components/ui';
import PlacementStage from '../components/PlacementStage';
import { MEASURED } from '../lib/measured';

// What each pod declares in deploy/experiment/workloads.yaml and
// benchmarks/webbench (the only inputs kube-scheduler scores on).
const PODS = [
  { name: 'webbench', note: 'The latency-sensitive web service we are placing.', request: 'cpu 500m, memory 64Mi', profile: MEASURED.profiles.webbench },
  { name: 'cache-stress', note: 'Runs four threads that flush the CPU cache.', request: 'cpu 100m, memory 128Mi', profile: MEASURED.profiles.cacheStress },
];

export default function Problem({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-16">
      <section className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-14 items-center">
        <div>
          <h1 className="hero-head">Kubernetes schedules on what pods claim.</h1>
          <p className="lead mt-5 text-ink-2">AKIL schedules on what the kernel sees them do.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={onNext}>See it live</Button>
          </div>
          <p className="text-sm text-muted mt-8 max-w-[44ch]">
            Flip the two views of the cluster. Nodes, requests and readings are from the live four-node cluster.
          </p>
        </div>
        <PlacementStage />
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl">One pod, two ledgers</h2>
        <div className="panels grid-cols-1 sm:grid-cols-2">
          {PODS.map((p) => (
            <div key={p.name} className="p-5">
              <h3 className="text-xl">{p.name}</h3>
              <p className="text-sm text-muted mt-1">{p.note}</p>
              <p className="text-sm text-muted mt-5">What kube-scheduler is told</p>
              <p className="measured text-ink mt-1">{p.request}</p>
              <p className="text-sm text-muted mt-5">What the kernel measured</p>
              <div className="mt-2 space-y-1.5">
                <SignalBar id="cache" value={p.profile.cache} max={1e6} />
                <SignalBar id="lock" value={p.profile.lock} max={1} />
                <SignalBar id="pageFault" value={p.profile.pf} max={1e4} />
                <SignalBar id="ctxSwitch" value={p.profile.cs} max={1e4} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panels sm:grid-cols-3">
        <Point title="The cost" text={MEASURED.costLine} />
        <Point title="The idea" text="Measure four kernel signals per workload with eBPF, and let the scheduler score nodes with them." />
        <Point title="The constraint" text="No changes to the apps or the kernel, and about a millisecond of queries per scheduling decision." />
      </section>
      <p className="text-sm text-muted">Kernel readings: {MEASURED.source}</p>
    </div>
  );
}

function Point({ title, text }: { title: string; text: string }) {
  return (
    <div className="p-5">
      <h3>{title}</h3>
      <p className="text-muted mt-2">{text}</p>
    </div>
  );
}
