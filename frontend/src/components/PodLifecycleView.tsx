import { useState, useEffect, useRef, useCallback } from 'react';
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
import TelemetryFlowDiagram from './TelemetryFlowDiagram';

interface PodInstance {
  id: string;
  name: string;
  node: string;
  status: 'Running' | 'Spawning' | 'Terminating';
  cpuUsage: number;
  memoryMb: number;
  cacheMissRate: number;
  createdAgo: number;
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
  const [targetReplicas, setTargetReplicas] = useState<number>(2);
  const [autoScalingEnabled, setAutoScalingEnabled] = useState<boolean>(true);
  const [simulatingStress, setSimulatingStress] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [showFlowChart, setShowFlowChart] = useState<boolean>(true);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);

  // Pods state
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
      timestamp: new Date(Date.now() - 45000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'SCALE UP',
      reason: 'Adaptive Autoscaler detected LLC cache miss rate > 1000/s on node-01. Scaled from 1 to 2 replicas to distribute memory bus contention.',
      targetReplicas: 2,
      triggerMetric: 'LLC Cache Misses: 1,420/s'
    },
    {
      id: 'evt-2',
      timestamp: new Date(Date.now() - 120000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'INFO',
      reason: 'Initial deployment demo-workload configured with 1 baseline replica.',
      targetReplicas: 1,
      triggerMetric: 'System Boot'
    }
  ]);

  const lastUserActionTime = useRef<number>(0);
  const isScalingRef = useRef<boolean>(false);

  // Deterministic scale function: scales UP or DOWN without race conditions
  const scalePodsTo = useCallback((newCount: number, reason: string, triggerMetric: string) => {
    if (newCount < 1 || newCount > 6) return;

    lastUserActionTime.current = Date.now();
    isScalingRef.current = true;
    setTargetReplicas(newCount);

    setPods(prevPods => {
      // Find active pods (excluding already terminating ones)
      const nonTerminating = prevPods.filter(p => p.status !== 'Terminating');
      const currentCount = nonTerminating.length;

      if (newCount === currentCount) {
        isScalingRef.current = false;
        return prevPods;
      }

      if (newCount > currentCount) {
        // SCALE UP: Append new spawning pods
        const countToAdd = newCount - currentCount;
        const nodePreference = ['worker-node-02', 'worker-node-03', 'worker-node-01'];
        const newPods: PodInstance[] = [];

        for (let i = 0; i < countToAdd; i++) {
          const targetNode = nodePreference[(currentCount + i) % nodePreference.length];
          const newPodId = `pod-${Date.now()}-${i}`;
          newPods.push({
            id: newPodId,
            name: `demo-workload-7cb4-${Math.random().toString(36).substring(2, 6)}`,
            node: targetNode,
            status: 'Spawning',
            cpuUsage: Math.floor(25 + Math.random() * 25),
            memoryMb: Math.floor(130 + Math.random() * 20),
            cacheMissRate: Math.floor(120 + Math.random() * 80),
            createdAgo: 0
          });
        }

        const newPodIds = new Set(newPods.map(p => p.id));

        // After 1.2s, transition specifically these new pods from Spawning to Running
        setTimeout(() => {
          setPods(curr => curr.map(p => {
            if (newPodIds.has(p.id)) {
              return { ...p, status: 'Running' };
            }
            return p;
          }));
          isScalingRef.current = false;
        }, 1200);

        // Record log event
        const newEvt: ScalingEvent = {
          id: `evt-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          action: 'SCALE UP',
          reason,
          targetReplicas: newCount,
          triggerMetric
        };
        setEvents(e => [newEvt, ...e.slice(0, 19)]);

        return [...prevPods, ...newPods];
      } else {
        // SCALE DOWN: Mark surplus pods as Terminating
        const countToKill = currentCount - newCount;
        const podsToKill = nonTerminating.slice(-countToKill);
        const killIds = new Set(podsToKill.map(p => p.id));

        const updatedPods = prevPods.map(p => {
          if (killIds.has(p.id)) {
            return { ...p, status: 'Terminating' as const };
          }
          return p;
        });

        // After 1.5s graceful drain, remove specifically these terminated pods
        setTimeout(() => {
          setPods(curr => curr.filter(p => !killIds.has(p.id)));
          isScalingRef.current = false;
        }, 1500);

        // Record log event
        const newEvt: ScalingEvent = {
          id: `evt-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          action: 'SCALE DOWN',
          reason,
          targetReplicas: newCount,
          triggerMetric
        };
        setEvents(e => [newEvt, ...e.slice(0, 19)]);

        return updatedPods;
      }
    });

    // Notify backend
    fetch(`http://localhost:8080/api/scale?replicas=${newCount}`, { method: 'POST' }).catch(() => {});
  }, []);

  // Poll backend without stomping on user actions
  useEffect(() => {
    let isMounted = true;
    const fetchBackend = async () => {
      try {
        const resScale = await fetch('http://localhost:8080/api/scale');
        if (resScale.ok) {
          const data = await resScale.json();
          if (isMounted) {
            setBackendConnected(true);
            const backendReps = data.replicas;
            // Only sync if user hasn't touched controls in the last 4 seconds and not currently in scaling animation
            if (
              typeof backendReps === 'number' && 
              backendReps >= 1 && 
              backendReps <= 6 &&
              Date.now() - lastUserActionTime.current > 4000 &&
              !isScalingRef.current
            ) {
              setPods(currentPods => {
                const activeCount = currentPods.filter(p => p.status !== 'Terminating').length;
                if (activeCount !== backendReps) {
                  // Reconcile silently if backend changed externally
                  scalePodsTo(backendReps, 'Reconciled with cluster aggregator spec.', 'Backend Sync');
                }
                return currentPods;
              });
            }
          }
        }

        const resAuto = await fetch('http://localhost:8080/api/autoscale/status');
        if (resAuto.ok) {
          const dataAuto = await resAuto.json();
          if (isMounted && typeof dataAuto.enabled === 'boolean') {
            setAutoScalingEnabled(dataAuto.enabled);
          }
        }
      } catch {
        if (isMounted) setBackendConnected(false);
      }
    };

    fetchBackend();
    const interval = setInterval(fetchBackend, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [scalePodsTo]);

  // Contention simulation handler
  const handleSimulateContention = (type: 'cache_thrash' | 'ctx_storm' | 'clear') => {
    if (type === 'clear') {
      setSimulatingStress(null);
      scalePodsTo(
        2, 
        'Contention normalized to safe baseline. Autoscaler scaled DOWN to 2 replicas to conserve CPU cores.',
        'Contention Normalized'
      );
      fetch('http://localhost:8080/api/reset-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workload_key: 'demo-workload' })
      }).catch(() => {});
      return;
    }

    setSimulatingStress(type);

    if (type === 'cache_thrash') {
      const target = Math.min(6, Math.max(3, targetReplicas + 1));
      scalePodsTo(
        target,
        'Kernel eBPF probe detected severe LLC cache thrashing (> 1,200/s) on worker-01. Autoscaler automatically scaled UP to distribute memory traffic.',
        'LLC Miss Rate: 1,840/s'
      );
      fetch('http://localhost:8080/api/simulate-events', {
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
      }).catch(() => {});
    } else if (type === 'ctx_storm') {
      const target = Math.min(6, Math.max(3, targetReplicas + 1));
      scalePodsTo(
        target,
        'Kernel eBPF probe detected thread context-switch storm (> 150/s). Autoscaler scaled UP to spawn an isolated container instance.',
        'Context Switches: 185/s'
      );
      fetch('http://localhost:8080/api/simulate-events', {
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
      }).catch(() => {});
    }
  };

  const handleToggleAutoscaler = async () => {
    const nextState = !autoScalingEnabled;
    setAutoScalingEnabled(nextState);

    const logEntry: ScalingEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'INFO',
      reason: `Adaptive Autoscaler switched ${nextState ? 'ON (Autonomous eBPF Telemetry Mode)' : 'OFF (Manual Operator Control)'}.`,
      targetReplicas,
      triggerMetric: 'Operator Action'
    };
    setEvents(prev => [logEntry, ...prev]);

    try {
      await fetch(`http://localhost:8080/api/autoscale/${nextState ? 'enable' : 'disable'}`, { method: 'POST' });
    } catch {}
  };

  const activePods = pods.filter(p => p.status !== 'Terminating');
  const spawningPods = pods.filter(p => p.status === 'Spawning');
  const terminatingPods = pods.filter(p => p.status === 'Terminating');

  return (
    <div className="space-y-10 pb-12">
      {/* Top Banner with Generous Breathing Space */}
      <div className="p-6 lg:p-7 rounded-xl bg-[#151922] border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
              CLUSTER LIFECYCLE
            </span>
            <h2 className="text-base font-semibold text-zinc-100">
              Kubernetes Pods &amp; Microarchitectural Autoscaling
            </h2>
          </div>
          <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
            Directly observe active microservice pods across cluster nodes. When microarchitectural contention is detected by eBPF probes, 
            AKIL automatically provisions new pods on quiet CPU sockets to eliminate noisy-neighbor latency spikes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setShowFlowChart(!showFlowChart)}
            className="px-3.5 py-2 rounded-lg text-xs font-mono border border-zinc-700 bg-[#1b2230] text-zinc-200 hover:text-white flex items-center gap-2 transition-all"
          >
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            {showFlowChart ? 'Hide Telemetry Flow' : 'Show Telemetry Flow Chart'}
          </button>

          <button 
            onClick={() => setShowGuide(!showGuide)}
            className="px-3.5 py-2 rounded-lg text-xs font-mono border border-zinc-700 bg-[#1b2230] text-zinc-200 hover:text-white flex items-center gap-2 transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
            {showGuide ? 'Hide Guide' : 'What is this?'}
          </button>
        </div>
      </div>

      {/* Expandable Plain English Concepts Guide */}
      {showGuide && (
        <div className="p-6 rounded-xl bg-[#181e2b] border border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-lg bg-[#151922] border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold font-mono text-xs">
              <Server className="w-4 h-4 text-emerald-400" />
              1. What is a Pod?
            </div>
            <p className="text-zinc-400 leading-relaxed text-xs">
              A <strong>Pod</strong> is a containerized instance of your application. Each pod card below represents an independent process handling user HTTP requests on a cluster node.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#151922] border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold font-mono text-xs">
              <Zap className="w-4 h-4 text-amber-400" />
              2. How does Autoscaling trigger?
            </div>
            <p className="text-zinc-400 leading-relaxed text-xs">
              Standard Kubernetes HPA only looks at average CPU %. AKIL monitors 
              <strong> hardware cache misses</strong> and <strong>thread stalls</strong> in real time. When memory bandwidth is saturated, AKIL adds pods proactively.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#151922] border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold font-mono text-xs">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              3. Where are Pods scheduled?
            </div>
            <p className="text-zinc-400 leading-relaxed text-xs">
              AKIL scores each physical node using microarchitectural anti-affinity. Newly spawned pods are automatically placed on the CPU socket with the lowest contention.
            </p>
          </div>
        </div>
      )}

      {/* Architecture & Telemetry Flow Chart (Requested by User) */}
      {showFlowChart && (
        <TelemetryFlowDiagram />
      )}

      {/* KPI Status Cards with Generous Spacing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Pods Counter */}
        <div className="p-5 lg:p-6 rounded-xl bg-[#151922] border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>ACTIVE PODS</span>
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl lg:text-4xl font-bold font-mono text-zinc-100">
              {activePods.length}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              / 6 max replicas
            </span>
          </div>
          <div className="text-xs font-mono text-zinc-400 flex items-center gap-3 pt-2 border-t border-zinc-800/80">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {activePods.length - spawningPods.length} healthy
            </span>
            {spawningPods.length > 0 && (
              <span className="flex items-center gap-1 text-amber-400 animate-pulse font-semibold">
                +{spawningPods.length} spawning
              </span>
            )}
            {terminatingPods.length > 0 && (
              <span className="flex items-center gap-1 text-rose-400 font-semibold">
                -{terminatingPods.length} draining
              </span>
            )}
          </div>
        </div>

        {/* Autoscaling Engine Mode */}
        <div className="p-5 lg:p-6 rounded-xl bg-[#151922] border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>AUTOSCALING ENGINE</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${autoScalingEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            <span className="text-base font-semibold font-mono text-zinc-200">
              {autoScalingEnabled ? 'Autonomous eBPF' : 'Manual Override'}
            </span>
          </div>
          <div className="text-xs font-mono text-zinc-500 pt-2 border-t border-zinc-800/80">
            {autoScalingEnabled 
              ? 'Trigger: CtxSw > 100/s or LLC > 1k/s' 
              : 'Manual operator control active'}
          </div>
        </div>

        {/* Target Replicas Spec */}
        <div className="p-5 lg:p-6 rounded-xl bg-[#151922] border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>DESIRED SCALE SPEC</span>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl lg:text-4xl font-bold font-mono text-zinc-200">
              {targetReplicas}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              target pods
            </span>
          </div>
          <div className="text-xs font-mono text-zinc-400 pt-2 border-t border-zinc-800/80">
            {activePods.length === targetReplicas && terminatingPods.length === 0 ? (
              <span className="text-zinc-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Cluster state is stable &amp; reconciled
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Reconciling container cgroups...
              </span>
            )}
          </div>
        </div>

        {/* Contention Level Gauge */}
        <div className="p-5 lg:p-6 rounded-xl bg-[#151922] border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>CLUSTER CONTENTION</span>
            <Flame className={`w-4 h-4 ${simulatingStress ? 'text-rose-400' : 'text-zinc-500'}`} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-base font-semibold font-mono ${
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
          <div className="text-xs font-mono text-zinc-500 pt-2 border-t border-zinc-800/80">
            {backendConnected ? 'Connected to Aggregator (:8080)' : 'Interactive Mode'}
          </div>
        </div>
      </div>

      {/* Interactive Controls & Stress Testing Panel */}
      <div className="p-6 lg:p-7 rounded-xl bg-[#151922] border border-zinc-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="space-y-1">
            <h3 className="text-sm font-mono font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Pod Scaling &amp; Telemetry Simulation Controls
            </h3>
            <p className="text-xs text-zinc-400">
              Use the buttons below to manually scale pods or trigger microarchitectural contention spikes to test the autoscaler.
            </p>
          </div>

          <button
            onClick={handleToggleAutoscaler}
            className={`px-4 py-2 rounded-lg text-xs font-mono border transition-all flex items-center gap-2 self-start sm:self-auto ${
              autoScalingEnabled
                ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-300'
                : 'bg-[#1b2230] border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoScalingEnabled ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
            Autoscaler: {autoScalingEnabled ? 'ENABLED' : 'PAUSED'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Contention Injections */}
          <div className="p-5 rounded-lg bg-[#181e2b] border border-zinc-800 space-y-3">
            <div className="text-xs font-mono font-medium text-zinc-300 flex items-center justify-between">
              <span>ONE-CLICK CONTENTION DEMOS (TRIGGER AUTOSCALING)</span>
              <span className="text-[10px] text-zinc-500">eBPF Sensor</span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleSimulateContention('cache_thrash')}
                className={`px-3.5 py-2.5 rounded-lg text-xs font-mono border transition-all flex items-center gap-2 ${
                  simulatingStress === 'cache_thrash'
                    ? 'bg-rose-950/60 border-rose-800 text-rose-200 font-semibold shadow-sm'
                    : 'bg-[#151922] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
                }`}
              >
                <Flame className="w-4 h-4 text-rose-400" />
                Spike LLC Cache Misses (&gt;1,200/s)
              </button>

              <button
                onClick={() => handleSimulateContention('ctx_storm')}
                className={`px-3.5 py-2.5 rounded-lg text-xs font-mono border transition-all flex items-center gap-2 ${
                  simulatingStress === 'ctx_storm'
                    ? 'bg-amber-950/60 border-amber-800 text-amber-200 font-semibold shadow-sm'
                    : 'bg-[#151922] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
                }`}
              >
                <Cpu className="w-4 h-4 text-amber-400" />
                Spike Thread Switches (&gt;150/s)
              </button>

              <button
                onClick={() => handleSimulateContention('clear')}
                className="px-3.5 py-2.5 rounded-lg text-xs font-mono border border-zinc-700 bg-[#151922] text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 flex items-center gap-2 transition-all"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Clear Stress (Nominal)
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
              Injecting cache or context-switch stress prompts the autoscaler to automatically spawn pods on quiet nodes.
            </p>
          </div>

          {/* Manual Stepper & Pod Controls */}
          <div className="p-5 rounded-lg bg-[#181e2b] border border-zinc-800 space-y-3">
            <div className="text-xs font-mono font-medium text-zinc-300 flex items-center justify-between">
              <span>MANUAL POD REPLICA CONTROLS</span>
              <span className="text-[10px] text-zinc-500">1 to 6 Pods</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={targetReplicas <= 1}
                onClick={() => scalePodsTo(targetReplicas - 1, 'Operator manually decreased pods via stepper.', 'Manual Scale Down')}
                className="p-2.5 rounded-lg border border-zinc-800 bg-[#151922] text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Scale Down (-1 Pod)"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex-1 flex gap-2 justify-center">
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <button
                    key={num}
                    onClick={() => scalePodsTo(num, `Operator manually set replicas to ${num}.`, 'Manual Scale')}
                    className={`w-9 h-9 rounded-lg text-xs font-mono border transition-all ${
                      targetReplicas === num
                        ? 'bg-zinc-200 text-zinc-950 font-bold border-zinc-300 shadow-sm'
                        : 'bg-[#151922] text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button
                disabled={targetReplicas >= 6}
                onClick={() => scalePodsTo(targetReplicas + 1, 'Operator manually increased pods via stepper.', 'Manual Scale Up')}
                className="p-2.5 rounded-lg border border-zinc-800 bg-[#151922] text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Scale Up (+1 Pod)"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
              Click any number or the +/- buttons to scale pods up or down and verify real container provisioning.
            </p>
          </div>
        </div>
      </div>

      {/* Cluster Node Topology Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-mono font-semibold text-zinc-200 uppercase tracking-wider">
              Cluster Node Topology &amp; Hosted Pods
            </h3>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            {activePods.length} Pods running on 3 Nodes
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {NODES.map(node => {
            const nodePods = pods.filter(p => p.node === node.id);
            const isContended = simulatingStress && node.id === 'worker-node-01';

            return (
              <div 
                key={node.id}
                className={`p-5 lg:p-6 rounded-xl bg-[#151922] border transition-all flex flex-col justify-between min-h-[360px] ${
                  isContended 
                    ? 'border-rose-900/80 bg-rose-950/10' 
                    : 'border-zinc-800'
                }`}
              >
                {/* Node Header */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                    <div>
                      <div className="text-sm font-mono font-semibold text-zinc-200 flex items-center gap-2">
                        <Server className="w-4 h-4 text-zinc-400" />
                        {node.name}
                      </div>
                      <div className="text-xs font-mono text-zinc-500 mt-0.5">
                        {node.socket}
                      </div>
                    </div>

                    <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded border ${
                      isContended 
                        ? 'border-rose-800 bg-rose-950 text-rose-300 font-semibold' 
                        : 'border-zinc-800 bg-[#181e2b] text-zinc-400'
                    }`}>
                      {isContended ? 'CONTENDED' : 'HEALTHY'}
                    </span>
                  </div>

                  {/* Microarchitectural Telemetry Meters for Node */}
                  <div className="space-y-2 text-xs font-mono bg-[#181e2b] p-3 rounded-lg border border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">LLC Cache Misses:</span>
                      <span className={isContended ? 'text-rose-400 font-bold' : 'text-zinc-300'}>
                        {isContended ? '1,840 /s' : node.id === 'worker-node-02' ? '180 /s' : '310 /s'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Context Switches:</span>
                      <span className={simulatingStress === 'ctx_storm' && node.id === 'worker-node-01' ? 'text-amber-400 font-bold' : 'text-zinc-300'}>
                        {simulatingStress === 'ctx_storm' && node.id === 'worker-node-01' ? '210 /s' : '45 /s'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">AKIL Penalty Score:</span>
                      <span className={isContended ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                        {isContended ? '+64.5 (High)' : '+4.2 (Optimal)'}
                      </span>
                    </div>
                  </div>

                  {/* Pods Hosted on This Node */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                      <span>RUNNING PODS ({nodePods.length})</span>
                      <span className="text-zinc-500 text-[11px]">Capacity: 4 max</span>
                    </div>

                    {nodePods.length === 0 ? (
                      <div className="p-6 rounded-lg border border-dashed border-zinc-800 text-center font-mono text-xs text-zinc-600 bg-[#181e2b]/40">
                        No pods currently assigned to this node
                      </div>
                    ) : (
                      nodePods.map(pod => {
                        const isSpawning = pod.status === 'Spawning';
                        const isTerminating = pod.status === 'Terminating';

                        return (
                          <div
                            key={pod.id}
                            className={`p-3.5 rounded-lg border transition-all ${
                              isSpawning 
                                ? 'border-amber-800/80 bg-amber-950/30 ring-1 ring-amber-500/30' 
                                : isTerminating 
                                ? 'border-rose-900/60 bg-rose-950/30 opacity-75' 
                                : 'border-zinc-800 bg-[#181e2b]'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-mono text-xs font-semibold text-zinc-200 flex items-center gap-1.5 truncate">
                                <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                                <span className="truncate">{pod.name}</span>
                              </div>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${
                                isSpawning 
                                  ? 'border-amber-700 bg-amber-950 text-amber-300 font-semibold' 
                                  : isTerminating 
                                  ? 'border-rose-800 bg-rose-950 text-rose-300 font-semibold' 
                                  : 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300'
                              }`}>
                                {pod.status.toUpperCase()}
                              </span>
                            </div>

                            {/* Spawning Status Progress */}
                            {isSpawning && (
                              <div className="text-[11px] font-mono text-amber-400 flex items-center gap-2 mt-1">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Initializing cgroups &amp; attaching eBPF probe...
                              </div>
                            )}

                            {/* Terminating Status Progress */}
                            {isTerminating && (
                              <div className="text-[11px] font-mono text-rose-400 flex items-center gap-2 mt-1">
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                                Draining in-flight connections (Graceful shutdown)...
                              </div>
                            )}

                            {/* Running Telemetry Footprint */}
                            {!isSpawning && !isTerminating && (
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-zinc-400 mt-2 pt-2 border-t border-zinc-800/80">
                                <div>CPU: <span className="text-zinc-200 font-semibold">{pod.cpuUsage}%</span></div>
                                <div>Mem: <span className="text-zinc-200 font-semibold">{pod.memoryMb} MB</span></div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Node Placement Summary */}
                <div className="mt-6 pt-3 border-t border-zinc-800/80 text-xs font-mono text-zinc-500">
                  {node.id === 'worker-node-02' ? (
                    <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      AKIL Preferred Target for Scale-Up
                    </span>
                  ) : isContended ? (
                    <span className="text-rose-400 flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      AKIL Anti-Affinity: Avoided by Scheduler
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

      {/* Pod Creation & Destruction Audit Log Feed */}
      <div className="p-6 lg:p-7 rounded-xl bg-[#151922] border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-mono font-semibold text-zinc-200 uppercase tracking-wider">
              Pod Creation &amp; Destruction Event Audit Log
            </h3>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            Records all scaling triggers and kernel decisions
          </span>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
          {events.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-zinc-600">
              No scaling events recorded yet.
            </div>
          ) : (
            events.map(evt => {
              const isUp = evt.action === 'SCALE UP';
              const isDown = evt.action === 'SCALE DOWN';

              return (
                <div 
                  key={evt.id}
                  className="p-4 rounded-lg bg-[#181e2b] border border-zinc-800/80 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
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
                        <span className="text-zinc-500 text-xs">{evt.timestamp}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#151922] border border-zinc-800 text-zinc-400">
                          Target: {evt.targetReplicas} pods
                        </span>
                      </div>
                      <p className="text-zinc-300 text-xs mt-1.5 leading-relaxed">
                        {evt.reason}
                      </p>
                    </div>
                  </div>

                  <div className="self-end sm:self-center text-right text-xs font-mono text-zinc-400 bg-[#151922] px-3 py-1.5 rounded border border-zinc-800/60 shrink-0">
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
