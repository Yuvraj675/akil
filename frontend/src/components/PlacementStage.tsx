import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createTimeline, stagger, utils } from 'animejs';
import { RotateCcw } from 'lucide-react';
import { fmt } from './ui';
import { MEASURED } from '../lib/measured';
import live from '../lib/live_summary.json';

// The three workers of the live experiment (deploy/experiment/workloads.yaml) as each
// scheduler saw them. CPU requests are what kube-scheduler scores; kernel readings and
// AKIL scores are what the aggregator and the akil-scheduler logged on the cluster.
type View = 'k8s' | 'kernel';
const P = MEASURED.profiles;
const NODES = [
  { name: 'node-1', resident: 'cache-stress', request: 100, signal: 'cache misses', reading: P.cacheStress.cache, max: 1e7, score: 0 },
  { name: 'node-2', resident: 'lock-stress', request: 1000, signal: 'context switches', reading: P.lockStress.cs, max: 1e5, score: 0 },
  { name: 'node-3', resident: 'batch-worker', request: 1000, signal: 'page faults', reading: P.batchWorker.pf, max: 1e4, score: 60 },
];
const CORES = 4000;
const PICK: Record<View, number> = { k8s: 0, kernel: 2 };

const placed = live.placed as Record<string, { placements?: Record<string, number> }>;
const countNear = (sched: string) =>
  Object.entries(placed[sched]?.placements ?? {}).filter(([k]) => k.includes('cache-stress')).reduce((a, [, n]) => a + n, 0);

const CAPTION: Record<View, string> = {
  k8s: `node-1 has the most free CPU, so kube-scheduler places the pod beside cache-stress: ${countNear('default-scheduler')} of 10 measured trials.`,
  kernel: `The kernel shows node-1 at 8.32 M cache misses/s behind a 100m request. AKIL scores it 0 and avoided it in ${10 - countNear('akil-scheduler')} of 10 trials.`,
};

const logFrac = (v: number, max: number) => Math.min(1, Math.log10(1 + v) / Math.log10(1 + max));
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Replay remounts the stage, so the intro always starts from a clean slate.
export default function PlacementStage() {
  const [run, setRun] = useState(0);
  return <Stage key={run} onReplay={() => setRun((n) => n + 1)} />;
}

function Stage({ onReplay }: { onReplay: () => void }) {
  const [view, setView] = useState<View>('k8s');
  const stage = useRef<HTMLDivElement>(null);
  const pod = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const values = useRef<(HTMLSpanElement | null)[]>([]);
  const scores = useRef<(HTMLSpanElement | null)[]>([]);
  const shown = useRef(NODES.map(() => ({ v: 0, s: 100 })));
  const touched = useRef(false);

  // Where the pod's top-left must sit to centre it on an element, relative to the stage.
  const target = useCallback((el: HTMLElement | null) => {
    if (!el || !stage.current || !pod.current) return { x: 0, y: 0 };
    const s = stage.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left + (r.width - pod.current.offsetWidth) / 2, y: r.top - s.top + (r.height - pod.current.offsetHeight) / 2 };
  }, []);

  const label = (i: number, v: View) => (v === 'k8s' ? `${(NODES[i].request / 1000).toFixed(1)} of 4 cores requested` : `${fmt(shown.current[i].v, '/s')} ${NODES[i].signal}`);

  const play = useCallback((v: View, first = false) => {
    const fast = reduced();
    const d = (ms: number) => (fast ? 0 : ms);
    const tl = createTimeline({ defaults: { ease: 'out(4)' } });
    const start = target(lane.current);
    const end = target(slots.current[PICK[v]]);

    if (first) {
      utils.set(pod.current!, { translateX: start.x, translateY: start.y - 12, opacity: 0 });
      tl.add('.stage-node', { opacity: [0, 1], translateY: [10, 0], duration: d(420), delay: stagger(d(70)) });
      tl.add(pod.current!, { opacity: 1, translateY: start.y, duration: d(260) }, '-=200');
    } else {
      // Lift the pod back into the lane before the readings change.
      tl.add(pod.current!, { translateX: start.x, translateY: start.y, duration: d(320), ease: 'inOut(3)' });
    }

    tl.label('readings');
    NODES.forEach((n, i) => {
      const frac = v === 'k8s' ? n.request / CORES : logFrac(n.reading, n.max);
      const o = shown.current[i];
      tl.add(bars.current[i]!, { scaleX: frac, duration: d(620) }, `readings+=${d(i * 70)}`);
      tl.add(o, {
        v: v === 'k8s' ? 0 : n.reading,
        s: v === 'k8s' ? 100 : n.score,
        duration: d(900),
        ease: 'out(3)',
        onUpdate: () => {
          if (values.current[i]) values.current[i]!.textContent = label(i, v);
          if (scores.current[i]) scores.current[i]!.textContent = v === 'k8s' ? `${((CORES - n.request) / 1000).toFixed(1)} cores free` : `AKIL score ${Math.round(o.s)}`;
        },
      }, `readings+=${d(i * 70)}`);
    });

    // Travel to the chosen node and settle into its slot.
    tl.add(pod.current!, { translateX: end.x, translateY: end.y, duration: d(720), ease: 'inOut(4)' }, `readings+=${d(560)}`);
    tl.add(pod.current!, { scale: [0.94, 1], duration: d(220) });
    return tl;
  }, [target]);

  // Intro: Kubernetes' choice, then the kernel's view, once, unless the presenter takes over.
  useLayoutEffect(() => {
    const tl = play('k8s', true);
    const t = setTimeout(() => { if (!touched.current) setView('kernel'); }, reduced() ? 0 : 3200);
    return () => { tl.pause(); clearTimeout(t); };
  }, [play]);

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const tl = play(view);
    return () => { tl.pause(); };
  }, [view, play]);

  // Keep the pod in its slot when the layout reflows.
  useEffect(() => {
    const onResize = () => { const e = target(slots.current[PICK[view]]); utils.set(pod.current!, { translateX: e.x, translateY: e.y }); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [view, target]);

  const choose = (v: View) => { touched.current = true; setView(v); };
  return (
    <div className="stage panels">
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="seg" role="group" aria-label="Whose view of the cluster">
          <button aria-pressed={view === 'k8s'} onClick={() => choose('k8s')}>What Kubernetes sees</button>
          <button aria-pressed={view === 'kernel'} onClick={() => choose('kernel')}>What the kernel sees</button>
        </div>
        <button className="tab inline-flex items-center gap-1.5" onClick={onReplay}><RotateCcw size={14} />Replay</button>
      </div>

      <div ref={stage} className="relative p-4 sm:p-5">
        <div className="h-12 mb-4 flex items-center gap-4">
          <span className="text-sm text-muted shrink-0">Pod to place</span>
          <div ref={lane} className="h-full flex-1 border border-dashed border-line rounded-pill" aria-hidden />
        </div>
        <div ref={pod} className="pod" aria-live="polite">
          <span className="measured">webbench</span>
          <span className="text-muted text-sm hidden sm:inline">500m</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {NODES.map((n, i) => {
            const flagged = view === 'kernel' && n.score === 0;
            return (
              <div key={n.name} className={`stage-node ${flagged ? 'is-flagged' : ''} ${PICK[view] === i ? 'is-picked' : ''}`}>
                <p className="measured text-ink">{n.name}</p>
                <p className="text-sm text-muted mt-0.5">{n.resident}</p>
                <span className="meter mt-4" aria-hidden>
                  <span ref={(el) => { bars.current[i] = el; }} className={view === 'k8s' ? 'meter-fill' : 'meter-fill meter-fill--kernel'} />
                </span>
                <p className="measured text-sm text-ink-2 mt-2 min-h-[2.6em]"><span ref={(el) => { values.current[i] = el; }}>{label(i, view)}</span></p>
                <p className="text-sm mt-1"><span ref={(el) => { scores.current[i] = el; }} className={flagged ? 'text-bad' : 'text-muted'}>{((CORES - n.request) / 1000).toFixed(1)} cores free</span></p>
                <div ref={(el) => { slots.current[i] = el; }} className="slot mt-4" aria-hidden />
              </div>
            );
          })}
        </div>
      </div>

      <p className="p-4 sm:p-5 text-ink-2 min-h-[5.5em]" aria-live="polite">{CAPTION[view]}</p>
    </div>
  );
}
