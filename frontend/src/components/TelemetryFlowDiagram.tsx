import { useState } from 'react';
import { 
  Server, 
  Cpu, 
  Zap, 
  Activity, 
  ShieldCheck, 
  CheckCircle2, 
  Flame, 
  Radio 
} from 'lucide-react';

interface StageProps {
  number: string;
  badge: string;
  title: string;
  analogy: string;
  description: string;
  metrics: string[];
  status: 'nominal' | 'active' | 'warning';
  icon: any;
}

export default function TelemetryFlowDiagram() {
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [isSimulatingEvent, setIsSimulatingEvent] = useState(false);
  const [simStep, setSimStep] = useState<number>(0);
  const [mode, setMode] = useState<'normal' | 'contended'>('contended');

  const triggerEventTrace = () => {
    if (isSimulatingEvent) return;
    setIsSimulatingEvent(true);
    setSimStep(1);

    const steps = [1, 2, 3, 4, 5];
    steps.forEach((step, idx) => {
      setTimeout(() => {
        setSimStep(step);
        setActiveStage(step);
        if (idx === steps.length - 1) {
          setTimeout(() => {
            setIsSimulatingEvent(false);
          }, 1500);
        }
      }, idx * 1100);
    });
  };

  const stages: StageProps[] = [
    {
      number: '01',
      badge: 'Application Layer',
      title: 'Container Pods',
      analogy: 'The Factory Floor',
      description: 'Microservice pods run user requests on physical CPU cores. When multiple containers share a machine, they compete for the shared L3 cache and memory bus.',
      metrics: ['User HTTP Requests', 'Memory Writes / Reads', 'POSIX Thread Execution'],
      status: mode === 'contended' ? 'warning' : 'nominal',
      icon: Server
    },
    {
      number: '02',
      badge: 'Linux Kernel Space',
      title: 'eBPF Hardware Probes',
      analogy: 'The Digital Stethoscope',
      description: 'Lightweight eBPF bytecode attaches to CPU hardware performance counters (PMU) and kernel scheduler hooks. Measures cache stalls with <0.5% overhead.',
      metrics: ['PERF_COUNT_HW_CACHE_MISSES', 'tracepoint/sched/sched_switch', 'tracepoint/exceptions/page_fault'],
      status: simStep >= 2 ? 'active' : 'nominal',
      icon: Cpu
    },
    {
      number: '03',
      badge: 'Zero-Copy Transport',
      title: 'BPF RingBuffer',
      analogy: 'The Express Highway',
      description: 'Telemetry events stream directly out of the Linux kernel through a lockless, shared-memory 16MB ring buffer to the node collector daemon without disk writes.',
      metrics: ['16MB Circular Buffer', 'Lockless Single-Producer / Single-Consumer', 'Sub-microsecond latency'],
      status: simStep >= 3 ? 'active' : 'nominal',
      icon: Zap
    },
    {
      number: '04',
      badge: 'Control Plane Engine',
      title: 'Sliding-Window Profiler',
      analogy: 'The Central Brain',
      description: 'Raw counter spikes are smoothed into a 60-second moving average runtime profile per cgroup. Computes the Microarchitectural Contention Index.',
      metrics: ['LLC Miss Rate (misses/s)', 'Lock Contention Ratio', 'Context Switch Rate (switches/s)'],
      status: simStep >= 4 ? 'active' : 'nominal',
      icon: Activity
    }
  ];

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#151922] p-6 lg:p-8 space-y-8">
      {/* Top Header with Breathing Room */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-800/80">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
              ARCHITECTURE OVERVIEW
            </span>
            <span className="text-xs font-mono text-zinc-500">
              Plain English Guide
            </span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            How AKIL Collects &amp; Processes Microarchitectural Telemetry
          </h2>
          <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
            Follow the journey of a hardware contention event from inside the CPU silicon, through the Linux kernel, to autonomous scheduling and autoscaling decisions.
          </p>
        </div>

        {/* Action Buttons with Clear Spacing */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setMode(mode === 'contended' ? 'normal' : 'contended')}
            className={`px-3.5 py-2 rounded-lg text-xs font-mono border transition-all flex items-center gap-2 ${
              mode === 'contended'
                ? 'bg-rose-950/40 border-rose-800/70 text-rose-300'
                : 'bg-emerald-950/40 border-emerald-800/70 text-emerald-300'
            }`}
          >
            {mode === 'contended' ? (
              <>
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>Simulating: Contended State</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simulating: Nominal State</span>
              </>
            )}
          </button>

          <button
            disabled={isSimulatingEvent}
            onClick={triggerEventTrace}
            className="px-4 py-2 rounded-lg text-xs font-mono bg-zinc-200 text-zinc-950 font-bold hover:bg-zinc-100 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
          >
            <Radio className={`w-3.5 h-3.5 ${isSimulatingEvent ? 'animate-pulse text-amber-600' : ''}`} />
            {isSimulatingEvent ? `Tracing Stage ${simStep} of 5...` : 'Trace Live Telemetry Flow'}
          </button>
        </div>
      </div>

      {/* 4-Stage Horizontal Pipeline Flow Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
        {stages.map((stage, idx) => {
          const isCurrentActive = simStep === idx + 1 || activeStage === idx + 1;
          const Icon = stage.icon;

          return (
            <div
              key={stage.number}
              onClick={() => setActiveStage(idx + 1)}
              className={`rounded-xl border p-5 flex flex-col justify-between transition-all cursor-pointer relative ${
                isCurrentActive
                  ? 'border-sky-500/80 bg-[#1c2333] shadow-lg ring-1 ring-sky-500/30'
                  : 'border-zinc-800 bg-[#181e2b] hover:border-zinc-700 hover:bg-[#1a2130]'
              }`}
            >
              {/* Card Header */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-zinc-500">
                      STAGE {stage.number}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                      {stage.badge}
                    </span>
                  </div>
                  <Icon className={`w-4 h-4 ${isCurrentActive ? 'text-sky-400' : 'text-zinc-500'}`} />
                </div>

                <h3 className="text-sm font-semibold text-zinc-100 mb-1">
                  {stage.title}
                </h3>
                <div className="text-xs font-mono text-sky-400/90 mb-3">
                  "{stage.analogy}"
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                  {stage.description}
                </p>
              </div>

              {/* Card Footer: Hardware Signatures */}
              <div className="pt-3 border-t border-zinc-800/80 space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Telemetry Signals
                </div>
                {stage.metrics.map((m, mIdx) => (
                  <div key={mIdx} className="text-[11px] font-mono text-zinc-300 flex items-center gap-1.5 truncate">
                    <span className="w-1 h-1 rounded-full bg-zinc-500" />
                    <span className="truncate">{m}</span>
                  </div>
                ))}
              </div>

              {/* Pulse Glow when stage is actively transmitting */}
              {isCurrentActive && (
                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-sky-400 animate-ping" />
              )}
            </div>
          );
        })}
      </div>

      {/* Stage 5: Dual Autonomous Actions Banner */}
      <div className="rounded-xl border border-zinc-800 bg-[#181e2b] p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-zinc-500">STAGE 05</span>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              Autonomous Decisions
            </span>
            <h3 className="text-sm font-semibold text-zinc-100">
              How AKIL Takes Action on Kernel Telemetry
            </h3>
          </div>
          <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
            Zero Human Intervention Required
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Action A: Scheduler Placement */}
          <div className={`p-5 rounded-lg border transition-all ${
            simStep === 5 
              ? 'border-emerald-600/80 bg-emerald-950/20' 
              : 'border-zinc-800 bg-[#151922]'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-semibold text-zinc-200 font-mono">
                  ACTION A: K8S SCHEDULER PLUGIN (ScorePoint)
                </h4>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                -68% Tail Latency
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              When a new pod needs to be placed, the AKIL scheduler plugin scores candidate nodes. It directs memory-heavy pods onto CPU sockets with low cache contention, preventing noisy neighbors.
            </p>
            <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2">
              <span>Decision Overhead:</span>
              <strong className="text-zinc-300 font-normal">0.31 ms / pod (budget: &lt;5 ms)</strong>
            </div>
          </div>

          {/* Action B: Telemetry Autoscaler */}
          <div className={`p-5 rounded-lg border transition-all ${
            simStep === 5 
              ? 'border-amber-600/80 bg-amber-950/20' 
              : 'border-zinc-800 bg-[#151922]'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-semibold text-zinc-200 font-mono">
                  ACTION B: ADAPTIVE TELEMETRY AUTOSCALER
                </h4>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                &lt;3s Reaction Time
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              Standard Kubernetes HPA only checks basic CPU %, taking minutes to scale. AKIL's autoscaler watches cache miss rates and context-switch storms. When contention spikes, it immediately scales UP new pods to distribute load.
            </p>
            <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2">
              <span>Autonomous Trigger:</span>
              <strong className="text-zinc-300 font-normal">LLC &gt; 1k/s or CtxSw &gt; 100/s</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
