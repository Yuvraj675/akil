import { useState, useEffect } from 'react';
import { 
  Server, 
  Cpu, 
  Plus, 
  Minus, 
  Flame, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck, 
  Zap, 
  Clock, 
  Layers, 
  HelpCircle,
  Activity
} from 'lucide-react';

interface PodInstance {
  id: string;
  name: string;
  node: string;
  status: 'Running' | 'Spawning' | 'Terminating';
  cpuUsage: number;
  memoryMb: number;
  cacheMissRate: number;
  createdAgo: number; // in seconds
  lifecycleProgress?: number; // 0-100 for spawning/terminating
}

interface ScalingEvent {
  id: string;
  timestamp: string;
  action: 'SCALE UP' | 'SCALE DOWN' | 'INFO';
  reason: string;
  targetReplicas: number;
  triggerMetric: string;
}

const NODES = [
  { id: 'worker-node-01', name: 'worker-node-01', socket: 'Socket 0 (LLC Contended)', coreCount: 16, memoryGb: 64 },
  { id: 'worker-node-02', name: 'worker-node-02', socket: 'Socket 1 (Memory Optimized)', coreCount: 16, memoryGb: 64 },
  { id: 'worker-node-03', name: 'worker-node-03', socket: 'Socket 0 (Spillover/Edge)', coreCount: 8, memoryGb: 32 },
];

export default function PodLifecycleView() {
  const [replicas, setReplicas] = useState<number>(2);
  const [targetReplicas, setTargetReplicas] = useState<number>(2);
  const [autoScalingEnabled, setAutoScalingEnabled] = useState<boolean>(true);
  const [pods, setPods] = useState<PodInstance[]>([
    {
      id: 'pod-1',
      name: 'demo-workload-7cb4-a1',
      node: 'worker-node-01',
      status: 'Running',
      cpuUsage: 48,
      memoryMb: 142,
      cacheMissRate: 310,
      createdAgo: 120,
    },
    {
      id: 'pod-2',
      name: 'demo-workload-7cb4-b2',
      node: 'worker-node-02',
      status: 'Running',
      cpuUsage: 42,
      memoryMb: 138,
      cacheMissRate: 180,
      createdAgo: 85,
    }
  ]);
  const [events, setEvents] = useState<ScalingEvent[]>([
    {
      id: 'evt-1',
      timestamp: new Date(Date.now() - 85000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'SCALE UP',
      reason: 'Adaptive Autoscaler detected LLC cache miss rate > 1000/s on node-01. Scaled from 1 to 2 replicas to distribute memory bus contention.',
      targetReplicas: 2,
      triggerMetric: 'LLC Cache Misses: 1,420/s'
    },
    {
      id: 'evt-2',
      timestamp: new Date(Date.now() - 150000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'INFO',
      reason: 'Initial deployment demo-workload configured with 1 baseline replica.',
      targetReplicas: 1,
      triggerMetric: 'System Boot'
    }
  ]);

  const [simulatingStress, setSimulatingStress] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);

  // Sync with real backend if available
  useEffect(() => {
    let isMounted = true;
    const fetchBackend = async () => {
      try {
        const resScale = await fetch('http://localhost:8080/api/scale');
        if (resScale.ok) {
          const dataScale = await resScale.json();
          if (isMounted && dataScale.replicas) {
            setBackendConnected(true);
            setTargetReplicas(dataScale.replicas);
          }
        }

        const resAuto = await fetch('http://localhost:8080/api/autoscale/status');
        if (resAuto.ok) {
          const dataAuto = await resAuto.json();
          if (isMounted) {
            setAutoScalingEnabled(dataAuto.enabled ?? true);
          }
        }

        const resLogs = await fetch('http://localhost:8080/api/logs');
        if (resLogs.ok) {
          const logsData = await resLogs.json();
          if (isMounted && Array.isArray(logsData) && logsData.length > 0) {
            const formatted: ScalingEvent[] = logsData.map((l: any, i: number) => ({
              id: `log-${i}`,
              timestamp: new Date(l.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              action: (l.action && l.action.includes('UP') ? 'SCALE UP' : l.action && l.action.includes('DOWN') ? 'SCALE DOWN' : 'INFO') as 'SCALE UP' | 'SCALE DOWN' | 'INFO',
              reason: l.reason,
              targetReplicas: l.replicas,
              triggerMetric: 'eBPF Telemetry Engine'
            }));
            setEvents(formatted.reverse());
          }
        }
      } catch {
        if (isMounted) setBackendConnected(false);
      }
    };

    fetchBackend();
    const interval = setInterval(fetchBackend, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Update pod reconciliation based on targetReplicas
  useEffect(() => {
    if (targetReplicas === pods.filter(p => p.status !== 'Terminating').length) {
      return;
    }

    const currentActive = pods.filter(p => p.status !== 'Terminating');
    const diff = targetReplicas - currentActive.length;

    if (diff > 0) {
      // Need to scale UP: spawn new pods
      const nodeDistribution = ['worker-node-02', 'worker-node-03', 'worker-node-01'];
      const newPods: PodInstance[] = [];

      for (let i = 0; i < diff; i++) {
        const targetNode = nodeDistribution[(currentActive.length + i) % nodeDistribution.length];
        const newPod: PodInstance = {
          id: `pod-${Date.now()}-${i}`,
          name: `demo-workload-7cb4-${Math.random().toString(36).substring(2, 6)}`,
          node: targetNode,
          status: 'Spawning',
          cpuUsage: Math.floor(25 + Math.random() * 30),
          memoryMb: Math.floor(130 + Math.random() * 25),
          cacheMissRate: Math.floor(140 + Math.random() * 90),
          createdAgo: 0,
          lifecycleProgress: 15
        };
        newPods.push(newPod);
      }

      setPods(prev => [...prev, ...newPods]);

      // Progressively transition from Spawning to Running
      const timer = setTimeout(() => {
        setPods(prev => prev.map(p => {
          if (p.status === 'Spawning') {
            return { ...p, status: 'Running', lifecycleProgress: 100 };
          }
          return p;
        }));
        setReplicas(targetReplicas);
      }, 1500);

      return () => clearTimeout(timer);
    } else if (diff < 0) {
      // Need to scale DOWN: gracefully terminate excess pods
      const countToKill = Math.abs(diff);
      const activePods = pods.filter(p => p.status !== 'Terminating');
      const podsToTerminate = activePods.slice(-countToKill);
      const terminateIds = new Set(podsToTerminate.map(p => p.id));

      setPods(prev => prev.map(p => {
        if (terminateIds.has(p.id)) {
          return { ...p, status: 'Terminating', lifecycleProgress: 75 };
        }
        return p;
      }));

      // After graceful drain timeout, remove terminated pods
      const timer = setTimeout(() => {
        setPods(prev => prev.filter(p => !terminateIds.has(p.id)));
        setReplicas(targetReplicas);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [targetReplicas, pods]);

  // Request scale from user control or simulation
  const handleRequestScale = async (newCount: number, reason: string, triggerMetric: string) => {
    if (newCount < 1 || newCount > 6) return;
    const actionType = newCount > targetReplicas ? 'SCALE UP' : 'SCALE DOWN';

    setTargetReplicas(newCount);

    const newEvent: ScalingEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: actionType,
      reason,
      targetReplicas: newCount,
      triggerMetric
    };
    setEvents(prev => [newEvent, ...prev.slice(0, 19)]);

    // Call backend API if running
    try {
      await fetch(`http://localhost:8080/api/scale?replicas=${newCount}`, { method: 'POST' });
    } catch {
      // Standalone simulation mode
    }
  };

  const handleToggleAutoscaler = async () => {
    const nextState = !autoScalingEnabled;
    setAutoScalingEnabled(nextState);

    const logEntry: ScalingEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'INFO',
      reason: `Adaptive Autoscaler toggled ${nextState ? 'ON (Autonomous eBPF Telemetry Mode)' : 'OFF (Manual Operator Control)'}.`,
      targetReplicas,
      triggerMetric: 'Operator Action'
    };
    setEvents(prev => [logEntry, ...prev]);

    try {
      await fetch(`http://localhost:8080/api/autoscale/${nextState ? 'enable' : 'disable'}`, { method: 'POST' });
    } catch {
      // Standalone simulation mode
    }
  };

  // Simulate contention spike that causes the autoscaler to trigger
  const handleSimulateContention = async (type: 'cache_thrash' | 'ctx_storm' | 'clear') => {
    if (type === 'clear') {
      setSimulatingStress(null);
      handleRequestScale(
        2, 
        'Microarchitectural contention subsided to nominal levels (LLC misses < 300/s). Autoscaler scaled DOWN to conserve compute nodes.',
        'Contention Normalized'
      );
      try {
        await fetch('http://localhost:8080/api/reset-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workload_key: 'demo-workload' })
        });
      } catch {
        // Fallback
      }
      return;
    }

    setSimulatingStress(type);

    if (type === 'cache_thrash') {
      // High cache misses triggers scale up to 4 pods
      const target = Math.min(6, targetReplicas + 2);
      handleRequestScale(
        target,
        'Kernel eBPF probe detected extreme LLC cache miss rate (> 1,200/s) on worker-node-01. Workload memory bandwidth saturated. Autoscaler scaling UP to distribute traffic across non-interfering CPU sockets.',
        'LLC Miss Rate: 1,840/s (Threshold: 1,000/s)'
      );

      try {
        await fetch('http://localhost:8080/api/simulate-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workload_key: 'demo-workload',
            node_name: 'worker-node-01',
            cache_misses: 25000,
            page_faults: 8000,
            lock_ns: 2000000,
            ctx_switches: 800
          })
        });
      } catch {
        // Simulated
      }
    } else if (type === 'ctx_storm') {
      const target = Math.min(6, targetReplicas + 1);
      handleRequestScale(
        target,
        'Kernel eBPF scheduler probe detected thread context-switch storm (> 150/s) with lock wait times exceeding 5ms. Scaling UP to spawn additional isolated replica.',
        'Context Switches: 185/s (Threshold: 100/s)'
      );

      try {
        await fetch('http://localhost:8080/api/simulate-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workload_key: 'demo-workload',
            node_name: 'worker-node-01',
            cache_misses: 400,
            page_faults: 300,
            lock_ns: 65000000,
            ctx_switches: 2600
          })
        });
      } catch {
        // Simulated
      }
    }
  };

  const activePodCount = pods.filter(p => p.status !== 'Terminating').length;
  const spawningPodCount = pods.filter(p => p.status === 'Spawning').length;
  const terminatingPodCount = pods.filter(p => p.status === 'Terminating').length;

  return (
    <div className="space-y-6">
      {/* Top Plain English Guide / Help Banner */}
      <div className="p-4 rounded-lg bg-surface-1 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              DASHBOARD GUIDE
            </span>
            <h2 className="text-sm font-semibold text-zinc-100">
              Pod Lifecycle &amp; Telemetry-Driven Autoscaling
            </h2>
          </div>
          <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
            This screen displays the <strong>active Kubernetes Pods</strong> running your microservice and visualizes 
            how AKIL’s kernel eBPF probes automatically <strong>spawn (scale UP)</strong> or <strong>terminate (scale DOWN)</strong> pods 
            when hardware-level cache thrashing or thread contention is detected.
          </p>
        </div>

        <button 
          onClick={() => setShowGuide(!showGuide)}
          className="self-start md:self-center px-3 py-1.5 rounded text-xs font-mono border border-zinc-700 bg-surface-2 text-zinc-300 hover:text-zinc-100 flex items-center gap-1.5 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
          {showGuide ? 'Hide Concepts' : 'What does each element do?'}
        </button>
      </div>

      {/* Expandable Concepts Breakdown */}
      {showGuide && (
        <div className="p-5 rounded-lg bg-surface-2 border border-zinc-800 text-xs grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded bg-surface-1 border border-zinc-800/80">
            <div className="flex items-center gap-2 mb-1 text-zinc-200 font-semibold font-mono">
              <Server className="w-4 h-4 text-emerald-400" />
              1. What is a Pod?
            </div>
            <p className="text-zinc-400 leading-relaxed text-[11px]">
              A <strong>Pod</strong> is the smallest deployable compute unit in Kubernetes — an instance of your container running on a physical cluster node. Each box below represents a pod serving user traffic.
            </p>
          </div>

          <div className="p-3.5 rounded bg-surface-1 border border-zinc-800/80">
            <div className="flex items-center gap-2 mb-1 text-zinc-200 font-semibold font-mono">
              <Zap className="w-4 h-4 text-amber-400" />
              2. How does Autoscaling trigger?
            </div>
            <p className="text-zinc-400 leading-relaxed text-[11px]">
              Standard Kubernetes HPA only looks at average CPU/RAM percentage. AKIL’s eBPF sensor measures 
              <strong> Last-Level Cache (LLC) misses</strong> and <strong>context switches</strong>. When memory contention spikes, AKIL spawns new pods to relieve the bottleneck.
            </p>
          </div>

          <div className="p-3.5 rounded bg-surface-1 border border-zinc-800/80">
            <div className="flex items-center gap-2 mb-1 text-zinc-200 font-semibold font-mono">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              3. Where are Pods placed?
            </div>
            <p className="text-zinc-400 leading-relaxed text-[11px]">
              The AKIL scheduler scores each physical node using microarchitectural anti-affinity. When a new pod spawns, it is steered onto the CPU socket with the <strong>lowest cache contention</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Primary KPI Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Pods Counter */}
        <div className="p-4 rounded-lg bg-surface-1 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
            <span>ACTIVE PODS</span>
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold font-mono text-zinc-100">
              {activePodCount}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              / 6 max replicas
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-zinc-400 flex items-center gap-2">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              {activePodCount - spawningPodCount} healthy
            </span>
            {spawningPodCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400 animate-pulse">
                +{spawningPodCount} spawning
              </span>
            )}
            {terminatingPodCount > 0 && (
              <span className="flex items-center gap-1 text-rose-400">
                -{terminatingPodCount} draining
              </span>
            )}
          </div>
        </div>

        {/* Autoscaler Mode */}
        <div className="p-4 rounded-lg bg-surface-1 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
            <span>AUTOSCALING ENGINE</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${autoScalingEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            <span className="text-sm font-semibold font-mono text-zinc-200">
              {autoScalingEnabled ? 'Autonomous eBPF' : 'Manual Override'}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-zinc-500">
            {autoScalingEnabled 
              ? 'Trigger: CtxSw > 100/s or LLC > 1k/s' 
              : 'Autonomous loop paused by operator'}
          </div>
        </div>

        {/* Target Replicas Spec */}
        <div className="p-4 rounded-lg bg-surface-1 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
            <span>DESIRED SCALE SPEC</span>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold font-mono text-zinc-200">
              {targetReplicas}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              target pods
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-zinc-400">
            {replicas === targetReplicas ? (
              <span className="text-zinc-500">Cluster state is stable &amp; reconciled</span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Reconciling container cgroups...
              </span>
            )}
          </div>
        </div>

        {/* Contention Level Gauge */}
        <div className="p-4 rounded-lg bg-surface-1 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
            <span>CLUSTER CONTENTION</span>
            <Flame className={`w-4 h-4 ${simulatingStress ? 'text-rose-400' : 'text-zinc-500'}`} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold font-mono ${
              simulatingStress === 'cache_thrash' 
                ? 'text-rose-400' 
                : simulatingStress === 'ctx_storm' 
                ? 'text-amber-400' 
                : 'text-emerald-400'
            }`}>
              {simulatingStress === 'cache_thrash' 
                ? 'Cache Thrashing' 
                : simulatingStress === 'ctx_storm' 
                ? 'Thread Contention' 
                : 'Nominal / Balanced'}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-zinc-500">
            {backendConnected ? 'Connected to Aggregator (:8080)' : 'Standalone Interactive Engine'}
          </div>
        </div>
      </div>

      {/* Interactive Controls & Stress Testing Panel */}
      <div className="p-5 rounded-lg bg-surface-1 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Interactive Autoscaling &amp; Pod Generation Controls
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Simulate hardware contention spikes to watch the autoscaler automatically spawn pods, or test manual scaling.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleAutoscaler}
              className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                autoScalingEnabled
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-surface-2 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoScalingEnabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              Autoscaler: {autoScalingEnabled ? 'ENABLED' : 'PAUSED'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          {/* Quick Contention Injections */}
          <div className="p-3.5 rounded bg-surface-2 border border-zinc-800">
            <div className="text-[11px] font-mono font-medium text-zinc-300 mb-2 flex items-center justify-between">
              <span>ONE-CLICK CONTENTION DEMOS (TRIGGER AUTOSCALING)</span>
              <span className="text-[10px] text-zinc-500">Simulates eBPF Events</span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSimulateContention('cache_thrash')}
                className={`px-3 py-2 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                  simulatingStress === 'cache_thrash'
                    ? 'bg-rose-950/60 border-rose-800 text-rose-200 font-semibold'
                    : 'bg-surface-1 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                Spike LLC Cache Misses (&gt;1,200/s)
              </button>

              <button
                onClick={() => handleSimulateContention('ctx_storm')}
                className={`px-3 py-2 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                  simulatingStress === 'ctx_storm'
                    ? 'bg-amber-950/60 border-amber-800 text-amber-200 font-semibold'
                    : 'bg-surface-1 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                Spike Thread Switches (&gt;150/s)
              </button>

              <button
                onClick={() => handleSimulateContention('clear')}
                className="px-3 py-2 rounded text-xs font-mono border border-zinc-700 bg-surface-1 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Clear Stress (Scale Back Down)
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 font-mono">
              Clicking a spike increases contention, prompting the autoscaler to automatically spawn pods on quiet nodes.
            </p>
          </div>

          {/* Manual Stepper & Slider */}
          <div className="p-3.5 rounded bg-surface-2 border border-zinc-800">
            <div className="text-[11px] font-mono font-medium text-zinc-300 mb-2 flex items-center justify-between">
              <span>MANUAL POD REPLICA STEPPER</span>
              <span className="text-[10px] text-zinc-500">1 to 6 Pods</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={targetReplicas <= 1}
                onClick={() => handleRequestScale(targetReplicas - 1, 'Operator manually decreased replicas via stepper.', 'Manual Scale Down')}
                className="p-2 rounded border border-zinc-800 bg-surface-1 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Scale Down (-1 Pod)"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex-1 flex gap-1 justify-center">
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <button
                    key={num}
                    onClick={() => handleRequestScale(num, `Operator manually set replicas to ${num}.`, 'Manual Scale')}
                    className={`w-8 h-8 rounded text-xs font-mono border transition-colors ${
                      targetReplicas === num
                        ? 'bg-zinc-200 text-zinc-950 font-bold border-zinc-300'
                        : 'bg-surface-1 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button
                disabled={targetReplicas >= 6}
                onClick={() => handleRequestScale(targetReplicas + 1, 'Operator manually increased replicas via stepper.', 'Manual Scale Up')}
                className="p-2 rounded border border-zinc-800 bg-surface-1 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Scale Up (+1 Pod)"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 font-mono">
              Directly override target replicas to test real-time pod provisioning and destruction animations.
            </p>
          </div>
        </div>
      </div>

      {/* Physical Cluster Nodes & Pod Placement Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider">
              Cluster Node Topology &amp; Pod Allocation
            </h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Total Allocated: {activePodCount} Pods across 3 Nodes
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {NODES.map(node => {
            const nodePods = pods.filter(p => p.node === node.id);
            const isContended = simulatingStress && node.id === 'worker-node-01';

            return (
              <div 
                key={node.id}
                className={`p-4 rounded-lg bg-surface-1 border transition-all flex flex-col justify-between ${
                  isContended 
                    ? 'border-rose-900/80 bg-rose-950/10' 
                    : 'border-zinc-800'
                }`}
              >
                {/* Node Header */}
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-3">
                    <div>
                      <div className="text-xs font-mono font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-zinc-400" />
                        {node.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        {node.socket}
                      </div>
                    </div>

                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      isContended 
                        ? 'border-rose-800 bg-rose-950 text-rose-300' 
                        : 'border-zinc-800 bg-surface-2 text-zinc-400'
                    }`}>
                      {isContended ? 'CONTENDED' : 'HEALTHY'}
                    </span>
                  </div>

                  {/* Microarchitectural Telemetry Meters for Node */}
                  <div className="space-y-2 mb-4 text-[10px] font-mono bg-surface-2/60 p-2.5 rounded border border-zinc-800/60">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">LLC Cache Misses:</span>
                      <span className={isContended ? 'text-rose-400 font-semibold' : 'text-zinc-300'}>
                        {isContended ? '1,840 /s' : node.id === 'worker-node-02' ? '180 /s' : '310 /s'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Context Switches:</span>
                      <span className={simulatingStress === 'ctx_storm' && node.id === 'worker-node-01' ? 'text-amber-400 font-semibold' : 'text-zinc-300'}>
                        {simulatingStress === 'ctx_storm' && node.id === 'worker-node-01' ? '210 /s' : '45 /s'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">AKIL Penalty Score:</span>
                      <span className={isContended ? 'text-rose-400' : 'text-emerald-400'}>
                        {isContended ? '+64.5 (High)' : '+4.2 (Optimal)'}
                      </span>
                    </div>
                  </div>

                  {/* Pods Hosted on This Node */}
                  <div className="space-y-2.5">
                    <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                      <span>RUNNING PODS ({nodePods.length})</span>
                      <span className="text-zinc-600">Capacity: 4 max</span>
                    </div>

                    {nodePods.length === 0 ? (
                      <div className="p-4 rounded border border-dashed border-zinc-800 text-center font-mono text-xs text-zinc-600 bg-surface-2/30">
                        No pods assigned to this node
                      </div>
                    ) : (
                      nodePods.map(pod => {
                        const isSpawning = pod.status === 'Spawning';
                        const isTerminating = pod.status === 'Terminating';

                        return (
                          <div
                            key={pod.id}
                            className={`p-3 rounded border transition-all ${
                              isSpawning 
                                ? 'border-amber-800/80 bg-amber-950/30 animate-pulse' 
                                : isTerminating 
                                ? 'border-rose-900/60 bg-rose-950/20 opacity-70' 
                                : 'border-zinc-800 bg-surface-2'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="font-mono text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                                <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                                {pod.name}
                              </div>
                              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                isSpawning 
                                  ? 'border-amber-700 bg-amber-950 text-amber-300' 
                                  : isTerminating 
                                  ? 'border-rose-800 bg-rose-950 text-rose-300' 
                                  : 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300'
                              }`}>
                                {pod.status.toUpperCase()}
                              </span>
                            </div>

                            {/* Spawning Status Progress */}
                            {isSpawning && (
                              <div className="text-[10px] font-mono text-amber-400 flex items-center gap-1.5 mt-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Initializing cgroups &amp; attaching eBPF probe...
                              </div>
                            )}

                            {/* Terminating Status Progress */}
                            {isTerminating && (
                              <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1.5 mt-1">
                                <Clock className="w-3 h-3 animate-spin" />
                                Draining in-flight connections (Graceful shutdown)...
                              </div>
                            )}

                            {/* Running Telemetry Footprint */}
                            {!isSpawning && !isTerminating && (
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400 mt-2 pt-2 border-t border-zinc-800/60">
                                <div>CPU: <span className="text-zinc-200">{pod.cpuUsage}%</span></div>
                                <div>Mem: <span className="text-zinc-200">{pod.memoryMb} MB</span></div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Node Placement Summary */}
                <div className="mt-4 pt-3 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-500">
                  {node.id === 'worker-node-02' ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      AKIL Preferred Target for Scale-Up
                    </span>
                  ) : isContended ? (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      AKIL Anti-Affinity: New Pods Avoided
                    </span>
                  ) : (
                    <span>Available capacity for spillover pods</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-time Chronological Event Audit Feed */}
      <div className="p-5 rounded-lg bg-surface-1 border border-zinc-800">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider">
              Pod Creation &amp; Destruction Event Audit Log
            </h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">
            Records all scaling triggers and kernel decisions
          </span>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <div className="p-4 text-center font-mono text-xs text-zinc-600">
              No scaling events recorded yet.
            </div>
          ) : (
            events.map(evt => {
              const isUp = evt.action === 'SCALE UP';
              const isDown = evt.action === 'SCALE DOWN';

              return (
                <div 
                  key={evt.id}
                  className="p-3 rounded bg-surface-2 border border-zinc-800/80 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      {isUp && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
                      {isDown && <ArrowDownRight className="w-4 h-4 text-rose-400" />}
                      {!isUp && !isDown && <ShieldCheck className="w-4 h-4 text-sky-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${
                          isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-sky-400'
                        }`}>
                          [{evt.action}]
                        </span>
                        <span className="text-zinc-500 text-[10px]">{evt.timestamp}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-1 border border-zinc-800 text-zinc-400">
                          Target: {evt.targetReplicas} pods
                        </span>
                      </div>
                      <p className="text-zinc-300 text-[11px] mt-1 leading-relaxed">
                        {evt.reason}
                      </p>
                    </div>
                  </div>

                  <div className="self-end sm:self-center text-right text-[10px] font-mono text-zinc-500 bg-surface-1 px-2 py-1 rounded border border-zinc-800/60">
                    {evt.triggerMetric}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
