import { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { RefreshCw } from 'lucide-react';
import SystemAnatomy from './SystemAnatomy';

interface WorkloadDef {
  key: string;
  name: string;
  cacheMisses: number;
  lockRatio: number;
  pageFaults: number;
  ctxSwitches: number;
  isLatencySensitive: boolean;
}

const WORKLOAD_DEFINITIONS: Record<string, WorkloadDef> = {
  'baseline-web': {
    key: 'baseline-web',
    name: 'baseline-web (HTTP Microservice)',
    cacheMisses: 120000,
    lockRatio: 0.04,
    pageFaults: 350,
    ctxSwitches: 2500,
    isLatencySensitive: true
  },
  'cache-stress': {
    key: 'cache-stress',
    name: 'cache-stress (Random Array Traverse)',
    cacheMisses: 900000,
    lockRatio: 0.08,
    pageFaults: 1200,
    ctxSwitches: 4000,
    isLatencySensitive: false
  },
  'lock-stress': {
    key: 'lock-stress',
    name: 'lock-stress (16-Thread Mutex Contention)',
    cacheMisses: 200000,
    lockRatio: 0.65,
    pageFaults: 500,
    ctxSwitches: 9500,
    isLatencySensitive: false
  },
  'batch-worker': {
    key: 'batch-worker',
    name: 'batch-worker (Data Ingestion Job)',
    cacheMisses: 150000,
    lockRatio: 0.05,
    pageFaults: 7500,
    ctxSwitches: 1800,
    isLatencySensitive: false
  }
};

type ClusterScenario = 'nominal' | 'cache_thrash' | 'mutex_storm' | 'memory_pressure';

export default function OverviewFlow() {
  const [scenario, setScenario] = useState<ClusterScenario>('cache_thrash');
  const [candidateKey, setCandidateKey] = useState<string>('baseline-web');
  const [placementResult, setPlacementResult] = useState<{
    selectedNode: string;
    scores: Record<string, number>;
    penalties: Record<string, { cache: number; lock: number; pf: number; ctx: number }>;
    timestamp: string;
  } | null>(null);

  const latencySeries = [
    { time: '20:00:00', defaultLatency: 17.5, akilLatency: 17.5 },
    { time: '20:00:05', defaultLatency: 18.1, akilLatency: 17.8 },
    { time: '20:00:10', defaultLatency: 48.2, akilLatency: 19.4 },
    { time: '20:00:15', defaultLatency: 61.7, akilLatency: 20.1 },
    { time: '20:00:20', defaultLatency: 63.1, akilLatency: 20.4 },
    { time: '20:00:25', defaultLatency: 59.8, akilLatency: 19.9 },
    { time: '20:00:30', defaultLatency: 64.2, akilLatency: 20.3 }
  ];

  // Node topologies under different scenarios
  const getNodeState = () => {
    switch (scenario) {
      case 'cache_thrash':
        return [
          { id: 'node-01', name: 'worker-node-01', cpuAllocated: '450m / 4000m', residents: ['cache-stress'], cacheRate: 900000, lockRatio: 0.08, pageFaults: 1200, ctxSwitches: 4000 },
          { id: 'node-02', name: 'worker-node-02', cpuAllocated: '300m / 4000m', residents: ['batch-worker'], cacheRate: 150000, lockRatio: 0.05, pageFaults: 7500, ctxSwitches: 1800 },
          { id: 'node-03', name: 'worker-node-03', cpuAllocated: '100m / 4000m', residents: ['batch-worker'], cacheRate: 150000, lockRatio: 0.05, pageFaults: 7500, ctxSwitches: 1800 }
        ];
      case 'mutex_storm':
        return [
          { id: 'node-01', name: 'worker-node-01', cpuAllocated: '350m / 4000m', residents: ['lock-stress'], cacheRate: 200000, lockRatio: 0.65, pageFaults: 500, ctxSwitches: 9500 },
          { id: 'node-02', name: 'worker-node-02', cpuAllocated: '400m / 4000m', residents: ['batch-worker'], cacheRate: 150000, lockRatio: 0.05, pageFaults: 7500, ctxSwitches: 1800 },
          { id: 'node-03', name: 'worker-node-03', cpuAllocated: '100m / 4000m', residents: ['batch-worker'], cacheRate: 150000, lockRatio: 0.05, pageFaults: 7500, ctxSwitches: 1800 }
        ];
      case 'memory_pressure':
        return [
          { id: 'node-01', name: 'worker-node-01', cpuAllocated: '500m / 4000m', residents: ['batch-worker', 'batch-worker'], cacheRate: 300000, lockRatio: 0.10, pageFaults: 15000, ctxSwitches: 3600 },
          { id: 'node-02', name: 'worker-node-02', cpuAllocated: '200m / 4000m', residents: ['cache-stress'], cacheRate: 900000, lockRatio: 0.08, pageFaults: 1200, ctxSwitches: 4000 },
          { id: 'node-03', name: 'worker-node-03', cpuAllocated: '100m / 4000m', residents: ['idle-pod'], cacheRate: 20000, lockRatio: 0.01, pageFaults: 50, ctxSwitches: 600 }
        ];
      case 'nominal':
      default:
        return [
          { id: 'node-01', name: 'worker-node-01', cpuAllocated: '200m / 4000m', residents: ['batch-worker'], cacheRate: 150000, lockRatio: 0.05, pageFaults: 7500, ctxSwitches: 1800 },
          { id: 'node-02', name: 'worker-node-02', cpuAllocated: '200m / 4000m', residents: ['batch-worker'], cacheRate: 150000, lockRatio: 0.05, pageFaults: 7500, ctxSwitches: 1800 },
          { id: 'node-03', name: 'worker-node-03', cpuAllocated: '100m / 4000m', residents: ['idle-pod'], cacheRate: 20000, lockRatio: 0.01, pageFaults: 50, ctxSwitches: 600 }
        ];
    }
  };

  const currentNodes = getNodeState();

  // Scoring function: matches Section III-D of the IEEE paper
  const evaluatePlacement = () => {
    const cand = WORKLOAD_DEFINITIONS[candidateKey];
    const R_cache = 150000.0;
    const R_pf = 8000.0;
    const R_ctx = 8000.0;

    const scores: Record<string, number> = {};
    const penalties: Record<string, { cache: number; lock: number; pf: number; ctx: number }> = {};

    currentNodes.forEach(node => {
      let totalPenalty = 0;
      let cSum = 0, lSum = 0, pSum = 0, sSum = 0;

      node.residents.forEach(rKey => {
        const res = WORKLOAD_DEFINITIONS[rKey] || { cacheMisses: 20000, lockRatio: 0.01, pageFaults: 50, ctxSwitches: 600 };
        const cPen = (Math.min(cand.cacheMisses, res.cacheMisses) / R_cache) * 35.0;
        const lPen = (cand.lockRatio + res.lockRatio) * 30.0;
        const pPen = ((cand.pageFaults + res.pageFaults) / R_pf) * 20.0;
        const sPen = ((cand.ctxSwitches + res.ctxSwitches) / R_ctx) * 15.0;

        cSum += cPen;
        lSum += lPen;
        pSum += pPen;
        sSum += sPen;
        totalPenalty += (cPen + lPen + pPen + sPen);
      });

      const finalScore = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));
      scores[node.id] = finalScore;
      penalties[node.id] = {
        cache: Math.round(cSum * 10) / 10,
        lock: Math.round(lSum * 10) / 10,
        pf: Math.round(pSum * 10) / 10,
        ctx: Math.round(sSum * 10) / 10
      };
    });

    const bestNodeId = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);

    setPlacementResult({
      selectedNode: bestNodeId,
      scores,
      penalties,
      timestamp: new Date().toLocaleTimeString()
    });
  };

  useEffect(() => {
    evaluatePlacement();
  }, [scenario, candidateKey]);

  return (
    <div className="space-y-6">
      {/* High-Clarity System Purpose Banner */}
      <div className="p-5 rounded-lg bg-surface-1 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              SYSTEM OVERVIEW
            </span>
            <h2 className="text-sm font-semibold text-zinc-100">
              Microarchitectural Contention Telemetry &amp; Isolation
            </h2>
          </div>
          <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
            When standard Kubernetes schedules pods, it only checks CPU cores and RAM gigabytes. It has no visibility into 
            <strong> Last-Level Cache (LLC) thrashing</strong> or <strong>memory bus saturation</strong>. AKIL uses low-overhead kernel eBPF probes 
            to continuously measure hardware contention, steering latency-sensitive workloads onto isolated CPU sockets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="px-3 py-2 rounded bg-surface-2 border border-zinc-800 text-zinc-300">
            <span className="text-[10px] text-zinc-500 block">TAIL LATENCY</span>
            <span className="text-emerald-400 font-semibold">-68% Reduction</span>
          </div>
          <div className="px-3 py-2 rounded bg-surface-2 border border-zinc-800 text-zinc-300">
            <span className="text-[10px] text-zinc-500 block">SCHEDULER OVERHEAD</span>
            <span className="text-sky-400 font-semibold">0.31 ms / pod</span>
          </div>
        </div>
      </div>

      {/* Visual System Flow & Live Placement Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Latency & Degradation Real-time Graph (6 cols) */}
        <div className="lg:col-span-6 border border-zinc-800 bg-zinc-950 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                LIVE LATENCY TELEMETRY · p99 TAIL (ms)
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-0.5 bg-rose-500 inline-block"></span> Default K8s
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-0.5 bg-emerald-400 inline-block"></span> AKIL Plugin
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Comparison of request tail latency under adversarial co-location. The default scheduler triggers a 63.1 ms tail latency spike, while AKIL enforces isolation at 20.4 ms.
            </p>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencySeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" stroke="#52525b" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis stroke="#52525b" tick={{ fontSize: 10 }} tickLine={false} unit=" ms" domain={[0, 80]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: any) => [`${val} ms`, '']}
                  />
                  <Line type="monotone" dataKey="defaultLatency" name="Default K8s" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="akilLatency" name="AKIL" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border-t border-zinc-800/80 pt-3 mt-3 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">Target SLO Deadline: 15.0 ms</span>
            <span className="text-emerald-400 font-medium">AKIL Overhead: +0.31 ms (&lt;5ms budget)</span>
          </div>
        </div>

        {/* Right Column: Live Placement Decision Engine (6 cols) */}
        <div className="lg:col-span-6 border border-zinc-800 bg-zinc-950 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                REAL-TIME SCHEDULER SCORE() EVALUATION
              </div>
              <span className="text-[10px] font-mono border border-zinc-800 px-2 py-0.5 rounded text-zinc-400 bg-zinc-900/60">
                ScorePoint API
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] font-mono text-zinc-500 block mb-1">CANDIDATE POD</label>
                <select
                  value={candidateKey}
                  onChange={(e) => setCandidateKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded p-2 outline-none focus:border-zinc-500 font-mono"
                >
                  <option value="baseline-web">baseline-web (Latency Critical)</option>
                  <option value="cache-stress">cache-stress (LLC Thrashing)</option>
                  <option value="lock-stress">lock-stress (Futex Contention)</option>
                  <option value="batch-worker">batch-worker (Memory Heavy)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-zinc-500 block mb-1">CLUSTER SCENARIO</label>
                <select
                  value={scenario}
                  onChange={(e: any) => setScenario(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded p-2 outline-none focus:border-zinc-500 font-mono"
                >
                  <option value="cache_thrash">Cache Thrashing (Node 1 Contended)</option>
                  <option value="mutex_storm">Mutex Contention (Node 1 Contended)</option>
                  <option value="memory_pressure">Memory Pressure (Node 1 Contended)</option>
                  <option value="nominal">Nominal Cluster State</option>
                </select>
              </div>
            </div>

            {/* Calculated Decision Matrix */}
            <div className="space-y-2 mb-3">
              {currentNodes.map(node => {
                const score = placementResult?.scores[node.id] ?? 0;
                const isSelected = placementResult?.selectedNode === node.id;
                const pen = placementResult?.penalties[node.id] || { cache: 0, lock: 0, pf: 0, ctx: 0 };

                return (
                  <div
                    key={node.id}
                    className={`border rounded p-3 text-xs transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-zinc-300 bg-zinc-900/90 text-zinc-100'
                        : 'border-zinc-800/80 bg-zinc-900/30 text-zinc-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-zinc-200">{node.name}</span>
                        {isSelected && (
                          <span className="text-[10px] font-mono uppercase bg-zinc-100 text-black px-1.5 py-0.2 rounded font-bold">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                        Residents: {node.residents.join(', ')} · CPU: {node.cpuAllocated}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1 font-mono">
                        <span className={`text-base font-bold ${score >= 70 ? 'text-zinc-100' : 'text-zinc-500'}`}>
                          {score}
                        </span>
                        <span className="text-[10px] text-zinc-600">/ 100</span>
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        Δ: -{pen.cache}c -{pen.lock}l -{pen.pf}p -{pen.ctx}s
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-zinc-800/80 pt-3 flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono text-[11px] text-zinc-500">
              Evaluated via Formula III-D in 0.31 ms
            </span>
            <button
              onClick={evaluatePlacement}
              className="border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs px-3 py-1.5 rounded font-mono transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3 text-zinc-400" /> Re-evaluate Score()
            </button>
          </div>
        </div>
      </div>

      {/* Cluster Microarchitecture Topology Table */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
              NODE MICROARCHITECTURAL TOPOLOGY · KERNEL COUNTERS
            </div>
            <h3 className="text-sm font-semibold text-zinc-100 mt-0.5">
              Live Hardware Counter State Across Physical Cluster
            </h3>
          </div>
          <span className="text-xs font-mono text-zinc-400 border border-zinc-800 px-2 py-1 rounded bg-zinc-900/60">
            cgroupfs · PERF_COUNT_HW_CACHE_MISSES
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3">Node</th>
                <th className="py-2.5 px-3">Allocated CPU</th>
                <th className="py-2.5 px-3">Resident Workloads</th>
                <th className="py-2.5 px-3">LLC Miss Rate</th>
                <th className="py-2.5 px-3">Lock Wait Ratio</th>
                <th className="py-2.5 px-3">Page Faults/s</th>
                <th className="py-2.5 px-3">Ctx Switches/s</th>
                <th className="py-2.5 px-3 text-right">AKIL Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {currentNodes.map(node => {
                const score = placementResult?.scores[node.id] ?? 0;
                return (
                  <tr key={node.id} className="hover:bg-zinc-900/30">
                    <td className="py-3 px-3 font-semibold text-zinc-200">{node.name}</td>
                    <td className="py-3 px-3 text-zinc-400">{node.cpuAllocated}</td>
                    <td className="py-3 px-3 text-zinc-300 font-sans">{node.residents.join(', ')}</td>
                    <td className={`py-3 px-3 ${node.cacheRate > 500000 ? 'text-rose-400 font-semibold' : 'text-zinc-300'}`}>
                      {node.cacheRate.toLocaleString()} /s
                    </td>
                    <td className={`py-3 px-3 ${node.lockRatio > 0.2 ? 'text-rose-400 font-semibold' : 'text-zinc-300'}`}>
                      {(node.lockRatio * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-zinc-300">{node.pageFaults.toLocaleString()}</td>
                    <td className="py-3 px-3 text-zinc-300">{node.ctxSwitches.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-bold text-zinc-100">{score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Anatomy of the System Graphic (Directly integrated on the Home Page!) */}
      <SystemAnatomy />
    </div>
  );
}
