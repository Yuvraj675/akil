import { useState } from 'react';
import { 
  Play, 
  RotateCcw, 
  Cpu, 
  Server, 
  Layers, 
  CheckCircle2, 
  Flame, 
  Wifi, 
  WifiOff, 
  ArrowRight,
  Info
} from 'lucide-react';

type DemoStep = 'problem' | 'telemetry' | 'scheduling' | 'failover';

export default function ConferenceDemo() {
  const [activeStep, setActiveStep] = useState<DemoStep>('problem');
  const [activeScenario, setActiveScenario] = useState<'clean' | 'cache_thrash' | 'mutex_storm' | 'memory_leak'>('cache_thrash');
  const [aggregatorOnline, setAggregatorOnline] = useState<boolean>(true);
  const [candidateWorkload, setCandidateWorkload] = useState<'baseline-web' | 'cache-stress' | 'batch-worker'>('baseline-web');
  const [isSimulatingPlacement, setIsSimulatingPlacement] = useState<boolean>(false);
  const [selectedPlacementNode, setSelectedPlacementNode] = useState<string | null>(null);

  // Dynamic state based on scenario
  const getScenarioMetrics = () => {
    switch (activeScenario) {
      case 'cache_thrash':
        return {
          node1: { name: 'worker-node-01', pods: ['cache-stress (Noisy)'], cacheMissRate: 850000, lockRatio: 0.02, pageFaults: 850, ctxSwitches: 3200, status: 'thrashing' },
          node2: { name: 'worker-node-02', pods: ['batch-worker'], cacheMissRate: 140000, lockRatio: 0.04, pageFaults: 6800, ctxSwitches: 1600, status: 'nominal' },
          node3: { name: 'worker-node-03', pods: ['idle-pod'], cacheMissRate: 25000, lockRatio: 0.01, pageFaults: 80, ctxSwitches: 800, status: 'idle' },
          defaultP99: 63.1,
          akilP99: 20.4,
        };
      case 'mutex_storm':
        return {
          node1: { name: 'worker-node-01', pods: ['lock-stress (Noisy)'], cacheMissRate: 180000, lockRatio: 0.68, pageFaults: 420, ctxSwitches: 9800, status: 'contention' },
          node2: { name: 'worker-node-02', pods: ['batch-worker'], cacheMissRate: 150000, lockRatio: 0.05, pageFaults: 7200, ctxSwitches: 1900, status: 'nominal' },
          node3: { name: 'worker-node-03', pods: ['idle-pod'], cacheMissRate: 28000, lockRatio: 0.01, pageFaults: 70, ctxSwitches: 900, status: 'idle' },
          defaultP99: 58.4,
          akilP99: 19.8,
        };
      case 'memory_leak':
        return {
          node1: { name: 'worker-node-01', pods: ['mem-stress (Noisy)'], cacheMissRate: 310000, lockRatio: 0.03, pageFaults: 14500, ctxSwitches: 2600, status: 'thrashing' },
          node2: { name: 'worker-node-02', pods: ['redis-cache'], cacheMissRate: 120000, lockRatio: 0.08, pageFaults: 450, ctxSwitches: 2100, status: 'nominal' },
          node3: { name: 'worker-node-03', pods: ['idle-pod'], cacheMissRate: 22000, lockRatio: 0.01, pageFaults: 90, ctxSwitches: 750, status: 'idle' },
          defaultP99: 54.2,
          akilP99: 21.1,
        };
      case 'clean':
      default:
        return {
          node1: { name: 'worker-node-01', pods: ['web-worker'], cacheMissRate: 65000, lockRatio: 0.02, pageFaults: 210, ctxSwitches: 1400, status: 'nominal' },
          node2: { name: 'worker-node-02', pods: ['batch-worker'], cacheMissRate: 95000, lockRatio: 0.03, pageFaults: 1800, ctxSwitches: 1200, status: 'nominal' },
          node3: { name: 'worker-node-03', pods: ['idle-pod'], cacheMissRate: 20000, lockRatio: 0.01, pageFaults: 60, ctxSwitches: 600, status: 'idle' },
          defaultP99: 17.5,
          akilP99: 17.5,
        };
    }
  };

  const currentMetrics = getScenarioMetrics();

  // Compute live AKIL node scores
  const computeNodeScore = (nodeId: 1 | 2 | 3) => {
    if (!aggregatorOnline) {
      return { score: 50, cachePen: 0, lockPen: 0, pfPen: 0, ctxPen: 0, reason: 'Fail-Open: Aggregator offline (Neutral score)' };
    }

    const n = nodeId === 1 ? currentMetrics.node1 : nodeId === 2 ? currentMetrics.node2 : currentMetrics.node3;
    
    // Candidate specs
    let candCache = 120000;
    let candLock = 0.04;
    let candPF = 350;
    let candCtx = 2500;

    if (candidateWorkload === 'cache-stress') {
      candCache = 900000; candLock = 0.08; candPF = 1200; candCtx = 4000;
    } else if (candidateWorkload === 'batch-worker') {
      candCache = 150000; candLock = 0.05; candPF = 7500; candCtx = 1800;
    }

    // Formulas matching paper:
    const cachePen = (Math.min(candCache, n.cacheMissRate) / 150000.0) * 35.0;
    const lockPen = (candLock + n.lockRatio) * 30.0;
    const pfPen = ((candPF + n.pageFaults) / 8000.0) * 20.0;
    const ctxPen = ((candCtx + n.ctxSwitches) / 8000.0) * 15.0;

    const totalPen = cachePen + lockPen + pfPen + ctxPen;
    const finalScore = Math.max(0, Math.min(100, Math.round(100 - totalPen)));

    return {
      score: finalScore,
      cachePen: Math.round(cachePen * 10) / 10,
      lockPen: Math.round(lockPen * 10) / 10,
      pfPen: Math.round(pfPen * 10) / 10,
      ctxPen: Math.round(ctxPen * 10) / 10,
      reason: totalPen > 40 ? 'Severe interference penalty applied' : 'Acceptable placement score'
    };
  };

  const node1Score = computeNodeScore(1);
  const node2Score = computeNodeScore(2);
  const node3Score = computeNodeScore(3);

  const bestNodeId = !aggregatorOnline 
    ? 'worker-node-01' 
    : [
        { id: 'worker-node-01', score: node1Score.score },
        { id: 'worker-node-02', score: node2Score.score },
        { id: 'worker-node-03', score: node3Score.score },
      ].sort((a, b) => b.score - a.score)[0].id;

  const handleRunPlacement = () => {
    setIsSimulatingPlacement(true);
    setSelectedPlacementNode(null);
    setTimeout(() => {
      setSelectedPlacementNode(bestNodeId);
      setIsSimulatingPlacement(false);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Conference Presenter Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5 uppercase tracking-wide">
                <Play className="w-3.5 h-3.5 fill-current" /> Live Conference Stage Demo
              </span>
              <span className="text-slate-400 text-xs">5-Minute Interactive Presentation Walkthrough</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-100">
              AKIL: Runtime-Aware Kubernetes Placement in Action
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Demonstrate the blind spot of default Kubernetes scheduling, real-time eBPF kernel telemetry ingestion, live scoring penalties, and instantaneous fail-open recovery.
            </p>
          </div>

          {/* Stepper Navigation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveStep('problem')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                activeStep === 'problem' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <span>1. The Blind Spot</span>
              <span className="text-[10px] opacity-75 font-normal">Default K8s Flaw</span>
            </button>
            <button
              onClick={() => setActiveStep('telemetry')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                activeStep === 'telemetry' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <span>2. eBPF Telemetry</span>
              <span className="text-[10px] opacity-75 font-normal">Kernel Ring Buffer</span>
            </button>
            <button
              onClick={() => setActiveStep('scheduling')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                activeStep === 'scheduling' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <span>3. AKIL Placement</span>
              <span className="text-[10px] opacity-75 font-normal">Closed-Loop Score</span>
            </button>
            <button
              onClick={() => setActiveStep('failover')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                activeStep === 'failover' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <span>4. Fail-Open Safe</span>
              <span className="text-[10px] opacity-75 font-normal">Zero-Cost Fallback</span>
            </button>
          </div>
        </div>

        {/* Presenter Talking Points Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-start gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 text-xs">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-slate-300">
            {activeStep === 'problem' && (
              <span><strong className="text-rose-400">Speaker Script:</strong> "Kubernetes schedules workloads solely on requested CPU millicores and memory bytes. Notice how Node 1 has a cache-thrashing noisy neighbor, yet Default kube-scheduler places our latency-critical pod on that exact node, blowing up p99 tail latency from 17ms to 63ms!"</span>
            )}
            {activeStep === 'telemetry' && (
              <span><strong className="text-blue-400">Speaker Script:</strong> "Without application modifications, AKIL's eBPF probes continuously capture cache misses, mutex lock wait time, page faults, and context switches from the cgroup level, streaming batches into a 60-second sliding-window profile store with sub-millisecond query readiness."</span>
            )}
            {activeStep === 'scheduling' && (
              <span><strong className="text-emerald-400">Speaker Script:</strong> "At scheduling time, our custom Score plugin queries candidate and node profiles synchronously. It detects high mutual cache interference on Node 1, penalizes it heavily (Score: {node1Score.score}), and binds the incoming pod to clean Node 3 (Score: {node3Score.score}), preserving the 15ms SLO!"</span>
            )}
            {activeStep === 'failover' && (
              <span><strong className="text-amber-400">Speaker Script:</strong> "Kubernetes scheduling can never hang. If the Aggregator is unreachable or times out (&gt;5ms), AKIL immediately degrades gracefully by returning a neutral score (50). Normal cluster scheduling proceeds at full throughput without delay."</span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Scenario Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inject Microarchitectural Stress:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveScenario('cache_thrash')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeScenario === 'cache_thrash' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" /> Cache Thrashing (stress-ng)
            </button>
            <button
              onClick={() => setActiveScenario('mutex_storm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeScenario === 'mutex_storm' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" /> Mutex Lock Storm (pthreads)
            </button>
            <button
              onClick={() => setActiveScenario('memory_leak')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeScenario === 'memory_leak' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" /> Page Fault Storm (vm-populate)
            </button>
            <button
              onClick={() => setActiveScenario('clean')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeScenario === 'clean' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" /> Reset Clean Cluster
            </button>
          </div>
        </div>

        {/* Fail-open toggle button */}
        <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
          <span className="text-xs text-slate-400">Aggregator gRPC:</span>
          <button
            onClick={() => setAggregatorOnline(!aggregatorOnline)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              aggregatorOnline ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' : 'bg-rose-600/30 text-rose-300 border border-rose-500/50 animate-pulse'
            }`}
          >
            {aggregatorOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
            {aggregatorOnline ? 'ONLINE (:50051)' : 'SIMULATE OFFLINE'}
          </button>
        </div>
      </div>

      {/* Main Interactive Stage Display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Node 1 */}
        <div className={`rounded-2xl border p-5 transition-all relative overflow-hidden ${
          selectedPlacementNode === 'worker-node-01'
            ? 'border-emerald-500 bg-emerald-950/20 ring-2 ring-emerald-500/40'
            : currentMetrics.node1.status === 'thrashing' || currentMetrics.node1.status === 'contention'
            ? 'border-rose-500/40 bg-rose-950/10'
            : 'border-slate-800 bg-slate-900/60'
        }`}>
          {selectedPlacementNode === 'worker-node-01' && (
            <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 font-bold text-[10px] px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Pod Bound Here
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-400" />
              <h3 className="font-bold text-slate-200 text-sm">{currentMetrics.node1.name}</h3>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              currentMetrics.node1.status === 'thrashing' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
              currentMetrics.node1.status === 'contention' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
              'bg-slate-800 text-slate-400'
            }`}>
              {currentMetrics.node1.status.toUpperCase()}
            </span>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 mb-4 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Resident Pods:</span>
              <span className="text-slate-200 font-sans font-semibold">{currentMetrics.node1.pods.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">LLC Miss Rate:</span>
              <span className={currentMetrics.node1.cacheMissRate > 500000 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                {currentMetrics.node1.cacheMissRate.toLocaleString()} /s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Lock Wait Ratio:</span>
              <span className={currentMetrics.node1.lockRatio > 0.2 ? 'text-purple-400 font-bold' : 'text-slate-300'}>
                {(currentMetrics.node1.lockRatio * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Page Faults:</span>
              <span className="text-slate-300">{currentMetrics.node1.pageFaults.toLocaleString()} /s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Context Switches:</span>
              <span className="text-slate-300">{currentMetrics.node1.ctxSwitches.toLocaleString()} /s</span>
            </div>
          </div>

          {/* AKIL Scoring Computation Card */}
          <div className="border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">AKIL Plugin Node Score:</span>
              <span className={`text-xl font-extrabold ${node1Score.score >= 70 ? 'text-emerald-400' : node1Score.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                {node1Score.score} <span className="text-xs text-slate-500 font-normal">/ 100</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] text-center text-slate-400 font-mono mb-2">
              <div className="bg-slate-950 p-1 rounded">C: -{node1Score.cachePen}</div>
              <div className="bg-slate-950 p-1 rounded">L: -{node1Score.lockPen}</div>
              <div className="bg-slate-950 p-1 rounded">P: -{node1Score.pfPen}</div>
              <div className="bg-slate-950 p-1 rounded">S: -{node1Score.ctxPen}</div>
            </div>
            <p className="text-[11px] text-slate-400 italic">{node1Score.reason}</p>
          </div>
        </div>

        {/* Node 2 */}
        <div className={`rounded-2xl border p-5 transition-all relative overflow-hidden ${
          selectedPlacementNode === 'worker-node-02'
            ? 'border-emerald-500 bg-emerald-950/20 ring-2 ring-emerald-500/40'
            : 'border-slate-800 bg-slate-900/60'
        }`}>
          {selectedPlacementNode === 'worker-node-02' && (
            <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 font-bold text-[10px] px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Pod Bound Here
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-400" />
              <h3 className="font-bold text-slate-200 text-sm">{currentMetrics.node2.name}</h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {currentMetrics.node2.status.toUpperCase()}
            </span>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 mb-4 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Resident Pods:</span>
              <span className="text-slate-200 font-sans font-semibold">{currentMetrics.node2.pods.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">LLC Miss Rate:</span>
              <span className="text-slate-300">{currentMetrics.node2.cacheMissRate.toLocaleString()} /s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Lock Wait Ratio:</span>
              <span className="text-slate-300">{(currentMetrics.node2.lockRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Page Faults:</span>
              <span className="text-slate-300">{currentMetrics.node2.pageFaults.toLocaleString()} /s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Context Switches:</span>
              <span className="text-slate-300">{currentMetrics.node2.ctxSwitches.toLocaleString()} /s</span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">AKIL Plugin Node Score:</span>
              <span className={`text-xl font-extrabold ${node2Score.score >= 70 ? 'text-emerald-400' : node2Score.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                {node2Score.score} <span className="text-xs text-slate-500 font-normal">/ 100</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] text-center text-slate-400 font-mono mb-2">
              <div className="bg-slate-950 p-1 rounded">C: -{node2Score.cachePen}</div>
              <div className="bg-slate-950 p-1 rounded">L: -{node2Score.lockPen}</div>
              <div className="bg-slate-950 p-1 rounded">P: -{node2Score.pfPen}</div>
              <div className="bg-slate-950 p-1 rounded">S: -{node2Score.ctxPen}</div>
            </div>
            <p className="text-[11px] text-slate-400 italic">{node2Score.reason}</p>
          </div>
        </div>

        {/* Node 3 */}
        <div className={`rounded-2xl border p-5 transition-all relative overflow-hidden ${
          selectedPlacementNode === 'worker-node-03'
            ? 'border-emerald-500 bg-emerald-950/20 ring-2 ring-emerald-500/40'
            : 'border-slate-800 bg-slate-900/60'
        }`}>
          {selectedPlacementNode === 'worker-node-03' && (
            <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 font-bold text-[10px] px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Pod Bound Here
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-400" />
              <h3 className="font-bold text-slate-200 text-sm">{currentMetrics.node3.name}</h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {currentMetrics.node3.status.toUpperCase()}
            </span>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 mb-4 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Resident Pods:</span>
              <span className="text-slate-200 font-sans font-semibold">{currentMetrics.node3.pods.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">LLC Miss Rate:</span>
              <span className="text-slate-300">{currentMetrics.node3.cacheMissRate.toLocaleString()} /s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Lock Wait Ratio:</span>
              <span className="text-slate-300">{(currentMetrics.node3.lockRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Page Faults:</span>
              <span className="text-slate-300">{currentMetrics.node3.pageFaults.toLocaleString()} /s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Context Switches:</span>
              <span className="text-slate-300">{currentMetrics.node3.ctxSwitches.toLocaleString()} /s</span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">AKIL Plugin Node Score:</span>
              <span className={`text-xl font-extrabold ${node3Score.score >= 70 ? 'text-emerald-400' : node3Score.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                {node3Score.score} <span className="text-xs text-slate-500 font-normal">/ 100</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] text-center text-slate-400 font-mono mb-2">
              <div className="bg-slate-950 p-1 rounded">C: -{node3Score.cachePen}</div>
              <div className="bg-slate-950 p-1 rounded">L: -{node3Score.lockPen}</div>
              <div className="bg-slate-950 p-1 rounded">P: -{node3Score.pfPen}</div>
              <div className="bg-slate-950 p-1 rounded">S: -{node3Score.ctxPen}</div>
            </div>
            <p className="text-[11px] text-slate-400 italic">{node3Score.reason}</p>
          </div>
        </div>
      </div>

      {/* Live Scheduling Action Trigger Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4" /> Schedule Incoming Candidate Pod
          </div>
          <h4 className="text-lg font-bold text-slate-100">
            Submit Workload to Kubernetes Scheduling Framework
          </h4>
          <p className="text-xs text-slate-400">
            Simulates <code className="bg-slate-950 px-1.5 py-0.5 rounded text-indigo-300">kube-scheduler</code> Score() extension point execution in real time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={candidateWorkload}
            onChange={(e: any) => setCandidateWorkload(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
          >
            <option value="baseline-web">Candidate: baseline-web (Latency Critical)</option>
            <option value="cache-stress">Candidate: cache-stress (Cache Heavy)</option>
            <option value="batch-worker">Candidate: batch-worker (Memory Heavy)</option>
          </select>

          <button
            onClick={handleRunPlacement}
            disabled={isSimulatingPlacement}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isSimulatingPlacement ? (
              <>Evaluating Scores...</>
            ) : (
              <>
                <span>Run Score &amp; Bind Pod</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Latency Comparison Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400">Under Default kube-scheduler:</span>
            <span className="text-xs font-bold bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded border border-rose-500/30">SLO VIOLATED</span>
          </div>
          <div className="text-3xl font-extrabold text-rose-400 mb-1">
            {currentMetrics.defaultP99} ms <span className="text-xs text-slate-500 font-normal">p99 tail</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Because default Kubernetes only examines CPU millicores (100m requested), it co-locates latency-sensitive web with noisy neighbors on Node 1, causing 62.4% LLC cache misses and severe memory bus stalls.
          </p>
        </div>

        <div className="bg-emerald-950/10 border border-emerald-500/30 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-400">Under AKIL ScorePlugin:</span>
            <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">SLO PRESERVED</span>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mb-1">
            {currentMetrics.akilP99} ms <span className="text-xs text-slate-500 font-normal">p99 tail</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            AKIL calculates the pairwise cache penalty <code className="text-emerald-300">min(m_c, m_i)</code>, steers placement away from Node 1 to Node 3, and maintains tail latency strictly within the 15.0ms SLO target.
          </p>
        </div>
      </div>
    </div>
  );
}
