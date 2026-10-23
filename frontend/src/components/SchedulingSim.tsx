import { useState } from 'react';
import { Cpu, Server, Activity, ArrowRight, CheckCircle2, Sliders, RotateCcw } from 'lucide-react';

interface Workload {
  name: string;
  cacheMisses: number; // misses/s
  lockRatio: number;   // 0.0 - 1.0
  pageFaults: number;  // faults/s
  ctxSwitches: number; // switches/s
  description: string;
}

const WORKLOAD_PROFILES: Record<string, Workload> = {
  'baseline-web': {
    name: 'baseline-web (HTTP Microservice)',
    cacheMisses: 120000,
    lockRatio: 0.04,
    pageFaults: 350,
    ctxSwitches: 2500,
    description: 'Latency-critical target service with 15ms SLO deadline.'
  },
  'cache-stress': {
    name: 'cache-stress (LLC Thrashing)',
    cacheMisses: 900000,
    lockRatio: 0.08,
    pageFaults: 1200,
    ctxSwitches: 4000,
    description: 'Random 512MB memory array access invalidating L3 cache lines.'
  },
  'lock-stress': {
    name: 'lock-stress (Futex Contention)',
    cacheMisses: 200000,
    lockRatio: 0.65,
    pageFaults: 500,
    ctxSwitches: 9500,
    description: '16 concurrent threads contending on shared kernel mutexes.'
  },
  'batch-worker': {
    name: 'batch-worker (Memory Intensive)',
    cacheMisses: 150000,
    lockRatio: 0.05,
    pageFaults: 7500,
    ctxSwitches: 1800,
    description: 'Data ingestion worker with high minor/major page faults.'
  }
};

const CLUSTER_NODES = [
  {
    id: 'worker-node-01',
    name: 'worker-node-01',
    residents: ['cache-stress'],
    description: 'Hosting cache thrashing workload'
  },
  {
    id: 'worker-node-02',
    name: 'worker-node-02',
    residents: ['lock-stress', 'batch-worker'],
    description: 'Hosting mutex storm and batch worker'
  },
  {
    id: 'worker-node-03',
    name: 'worker-node-03',
    residents: ['batch-worker'],
    description: 'Low-contention clean node'
  }
];

export default function SchedulingSim() {
  const [candidate, setCandidate] = useState<string>('baseline-web');
  const [weights, setWeights] = useState({
    cache: 35,
    lock: 30,
    pf: 20,
    ctx: 15
  });
  const [isScoring, setIsScoring] = useState(false);
  const [scoreResults, setScoreResults] = useState<Record<string, any>>({});

  const R_cache = 150000.0;
  const R_pf = 8000.0;
  const R_ctx = 8000.0;

  const calculateScoreForNode = (node: typeof CLUSTER_NODES[0]) => {
    const cand = WORKLOAD_PROFILES[candidate];
    let totalPenalty = 0;
    const breakdown = {
      cachePen: 0,
      lockPen: 0,
      pfPen: 0,
      ctxPen: 0
    };

    node.residents.forEach(rKey => {
      const res = WORKLOAD_PROFILES[rKey];
      if (!res) return;

      // Mathematical formula matching Section III-D of the IEEE paper
      const cPen = (Math.min(cand.cacheMisses, res.cacheMisses) / R_cache) * weights.cache;
      const lPen = (cand.lockRatio + res.lockRatio) * weights.lock;
      const pPen = ((cand.pageFaults + res.pageFaults) / R_pf) * weights.pf;
      const sPen = ((cand.ctxSwitches + res.ctxSwitches) / R_ctx) * weights.ctx;

      breakdown.cachePen += cPen;
      breakdown.lockPen += lPen;
      breakdown.pfPen += pPen;
      breakdown.ctxPen += sPen;
      totalPenalty += (cPen + lPen + pPen + sPen);
    });

    const finalScore = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));
    return {
      score: finalScore,
      totalPenalty: Math.round(totalPenalty * 10) / 10,
      breakdown: {
        cachePen: Math.round(breakdown.cachePen * 10) / 10,
        lockPen: Math.round(breakdown.lockPen * 10) / 10,
        pfPen: Math.round(breakdown.pfPen * 10) / 10,
        ctxPen: Math.round(breakdown.ctxPen * 10) / 10,
      }
    };
  };

  const handleSimulate = () => {
    setIsScoring(true);
    setScoreResults({});

    setTimeout(() => {
      const results: Record<string, any> = {};
      CLUSTER_NODES.forEach(n => {
        results[n.id] = calculateScoreForNode(n);
      });
      setScoreResults(results);
      setIsScoring(false);
    }, 500);
  };

  const getBestNodeId = () => {
    if (Object.keys(scoreResults).length === 0) return null;
    return Object.keys(scoreResults).reduce((a, b) => scoreResults[a].score > scoreResults[b].score ? a : b);
  };

  const bestNodeId = getBestNodeId();

  return (
    <div className="space-y-6">
      {/* Simulation Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-purple-500/20 text-purple-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-500/30">
                Mathematical Evaluation
              </span>
              <span className="text-slate-400 text-xs">Kubernetes ScorePlugin Algorithm</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="text-purple-400" /> AKIL Co-Location Penalty Scoring Simulator
            </h2>
          </div>

          <button
            onClick={() => setWeights({ cache: 35, lock: 30, pf: 20, ctx: 15 })}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors self-start md:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" /> Reset Paper Defaults (35, 30, 20, 15)
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed max-w-4xl font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
          Δ(c, i) = w_cache · (min(m_c, m_i) / R_cache) + w_lock · (l_c + l_i) + w_pf · ((f_c + f_i) / R_pf) + w_ctx · ((s_c + s_i) / R_ctx)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Candidate & Weight Sliders */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-200">1. Candidate Pod to Schedule</h3>
            <select
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-3 outline-none focus:border-purple-500"
            >
              {Object.keys(WORKLOAD_PROFILES).map(k => (
                <option key={k} value={k}>{WORKLOAD_PROFILES[k].name}</option>
              ))}
            </select>

            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 text-xs space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">LLC Miss Rate:</span>
                <span className="text-rose-400 font-bold">{WORKLOAD_PROFILES[candidate].cacheMisses.toLocaleString()} /s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Lock Wait Ratio:</span>
                <span className="text-purple-400 font-bold">{(WORKLOAD_PROFILES[candidate].lockRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Page Faults:</span>
                <span className="text-blue-400 font-bold">{WORKLOAD_PROFILES[candidate].pageFaults.toLocaleString()} /s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Context Switches:</span>
                <span className="text-amber-400 font-bold">{WORKLOAD_PROFILES[candidate].ctxSwitches.toLocaleString()} /s</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic">
              {WORKLOAD_PROFILES[candidate].description}
            </p>
          </div>

          {/* Scoring Weight Sliders */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-purple-400" /> 2. Signal Penalty Weights
              </h3>
              <span className="text-[11px] font-mono text-purple-400">Sum = {weights.cache + weights.lock + weights.pf + weights.ctx}</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>w_cache (Cache Misses):</span>
                  <span className="font-mono text-rose-400 font-bold">{weights.cache}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.cache}
                  onChange={(e) => setWeights({ ...weights, cache: Number(e.target.value) })}
                  className="w-full accent-rose-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>w_lock (Lock Contention):</span>
                  <span className="font-mono text-purple-400 font-bold">{weights.lock}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.lock}
                  onChange={(e) => setWeights({ ...weights, lock: Number(e.target.value) })}
                  className="w-full accent-purple-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>w_pf (Page Faults):</span>
                  <span className="font-mono text-blue-400 font-bold">{weights.pf}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.pf}
                  onChange={(e) => setWeights({ ...weights, pf: Number(e.target.value) })}
                  className="w-full accent-blue-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>w_ctx (Context Switches):</span>
                  <span className="font-mono text-amber-400 font-bold">{weights.ctx}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.ctx}
                  onChange={(e) => setWeights({ ...weights, ctx: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={handleSimulate}
              disabled={isScoring}
              className="w-full mt-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isScoring ? <Activity className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isScoring ? 'Computing Node Penalties...' : 'Run Scheduling Cycle'}
            </button>
          </div>
        </div>

        {/* Right Column: Node Placement Cards */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-slate-200">3. Candidate Node Scoring Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CLUSTER_NODES.map(node => {
              const res = scoreResults[node.id];
              const isSelected = bestNodeId === node.id;

              return (
                <div
                  key={node.id}
                  className={`bg-slate-900 border rounded-2xl p-5 flex flex-col relative overflow-hidden transition-all ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-950/10'
                      : 'border-slate-800'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Selected
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-1">
                    <Server className="w-4 h-4 text-slate-400" />
                    <h4 className="font-bold text-slate-200 text-sm">{node.name}</h4>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{node.description}</p>

                  <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-800/80 mb-3 text-xs space-y-1 font-mono">
                    <div className="text-[11px] text-slate-400 font-sans">Resident Containers:</div>
                    <div className="text-slate-300 font-bold">{node.residents.join(', ')}</div>
                  </div>

                  {res ? (
                    <div className="mt-auto space-y-3 pt-3 border-t border-slate-800">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-400">Final Score:</span>
                        <span className={`text-2xl font-extrabold font-mono ${
                          res.score >= 75 ? 'text-emerald-400' : res.score >= 50 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {res.score} <span className="text-xs text-slate-500 font-normal">/ 100</span>
                        </span>
                      </div>

                      <div className="text-[10px] space-y-1 font-mono bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                        <div className="flex justify-between text-rose-300">
                          <span>Cache Penalty:</span>
                          <span>-{res.breakdown.cachePen}</span>
                        </div>
                        <div className="flex justify-between text-purple-300">
                          <span>Lock Penalty:</span>
                          <span>-{res.breakdown.lockPen}</span>
                        </div>
                        <div className="flex justify-between text-blue-300">
                          <span>Page Fault Penalty:</span>
                          <span>-{res.breakdown.pfPen}</span>
                        </div>
                        <div className="flex justify-between text-amber-300">
                          <span>Ctx Switch Penalty:</span>
                          <span>-{res.breakdown.ctxPen}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto pt-6 text-center text-xs text-slate-500">
                      Click 'Run Scheduling Cycle' to compute scores
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
