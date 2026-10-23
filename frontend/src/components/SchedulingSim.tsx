import { useState } from 'react';
import { RotateCcw, Sliders } from 'lucide-react';

interface Workload {
  name: string;
  cacheMisses: number;
  lockRatio: number;
  pageFaults: number;
  ctxSwitches: number;
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
    const results: Record<string, any> = {};
    CLUSTER_NODES.forEach(n => {
      results[n.id] = calculateScoreForNode(n);
    });
    setScoreResults(results);
  };

  const bestNodeId = Object.keys(scoreResults).length > 0 
    ? Object.keys(scoreResults).reduce((a, b) => scoreResults[a].score > scoreResults[b].score ? a : b)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">
              MATHEMATICAL PENALTY FORMULATION · K8S SCORE PLUGIN
            </div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Scorer Sandbox &amp; Weight Tuning
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Explore the mathematical sensitivity of AKIL's pairwise interference equation. Adjust normalization weights and inspect the resulting node penalty distributions.
            </p>
          </div>

          <button
            onClick={() => setWeights({ cache: 35, lock: 30, pf: 20, ctx: 15 })}
            className="border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded font-mono transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" /> Defaults (35, 30, 20, 15)
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800/80 font-mono text-xs text-zinc-400">
          Δ(c, i) = w_cache · (min(m_c, m_i) / R_cache) + w_lock · (l_c + l_i) + w_pf · ((f_c + f_i) / R_pf) + w_ctx · ((s_c + s_i) / R_ctx)
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Candidate & Weights (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-5 space-y-4">
            <div>
              <label className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">Candidate Pod</label>
              <select
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded p-2.5 outline-none font-mono"
              >
                {Object.keys(WORKLOAD_PROFILES).map(k => (
                  <option key={k} value={k}>{WORKLOAD_PROFILES[k].name}</option>
                ))}
              </select>
            </div>

            <div className="border border-zinc-900 bg-black rounded p-3 text-xs font-mono space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Cache Miss Rate:</span>
                <span className="text-zinc-200">{WORKLOAD_PROFILES[candidate].cacheMisses.toLocaleString()} /s</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Lock Contention Ratio:</span>
                <span className="text-zinc-200">{(WORKLOAD_PROFILES[candidate].lockRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Page Fault Rate:</span>
                <span className="text-zinc-200">{WORKLOAD_PROFILES[candidate].pageFaults.toLocaleString()} /s</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Context Switch Rate:</span>
                <span className="text-zinc-200">{WORKLOAD_PROFILES[candidate].ctxSwitches.toLocaleString()} /s</span>
              </div>
            </div>
          </div>

          {/* Sliders */}
          <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-xs font-mono font-semibold text-zinc-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-zinc-400" /> Normalization Weights
              </span>
              <span className="text-xs font-mono text-zinc-500">
                Sum: {weights.cache + weights.lock + weights.pf + weights.ctx}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-zinc-400 font-mono mb-1">
                  <span>w_cache (Cache Thrashing)</span>
                  <span className="text-zinc-200 font-bold">{weights.cache}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.cache}
                  onChange={(e) => setWeights({ ...weights, cache: Number(e.target.value) })}
                  className="w-full accent-zinc-200 h-1 bg-zinc-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-zinc-400 font-mono mb-1">
                  <span>w_lock (Lock Contention)</span>
                  <span className="text-zinc-200 font-bold">{weights.lock}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.lock}
                  onChange={(e) => setWeights({ ...weights, lock: Number(e.target.value) })}
                  className="w-full accent-zinc-200 h-1 bg-zinc-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-zinc-400 font-mono mb-1">
                  <span>w_pf (Page Faults)</span>
                  <span className="text-zinc-200 font-bold">{weights.pf}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.pf}
                  onChange={(e) => setWeights({ ...weights, pf: Number(e.target.value) })}
                  className="w-full accent-zinc-200 h-1 bg-zinc-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-zinc-400 font-mono mb-1">
                  <span>w_ctx (Context Switches)</span>
                  <span className="text-zinc-200 font-bold">{weights.ctx}</span>
                </div>
                <input
                  type="range" min="0" max="60" value={weights.ctx}
                  onChange={(e) => setWeights({ ...weights, ctx: Number(e.target.value) })}
                  className="w-full accent-zinc-200 h-1 bg-zinc-800 rounded cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={handleSimulate}
              className="w-full mt-2 border border-zinc-700 bg-zinc-100 hover:bg-white text-black font-semibold text-xs py-2 rounded font-mono transition-colors"
            >
              Compute Node Penalties
            </button>
          </div>
        </div>

        {/* Right Column: Node Placement Cards (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            CANDIDATE NODES &amp; RESIDENT CO-TENANTS
          </div>

          {CLUSTER_NODES.map(node => {
            const res = scoreResults[node.id];
            const isSelected = bestNodeId === node.id;

            return (
              <div
                key={node.id}
                className={`border rounded-lg p-4 transition-all ${
                  isSelected
                    ? 'border-zinc-300 bg-zinc-900/90 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-zinc-200">{node.name}</span>
                    {isSelected && (
                      <span className="text-[10px] font-mono uppercase bg-zinc-100 text-black px-1.5 py-0.2 rounded font-bold">
                        Highest Score
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 font-mono">
                    Residents: {node.residents.join(', ')}
                  </span>
                </div>

                {res ? (
                  <div className="border-t border-zinc-800/80 pt-3 mt-2 flex items-center justify-between">
                    <div className="text-[11px] font-mono text-zinc-500 space-x-3">
                      <span>C: -{res.breakdown.cachePen}</span>
                      <span>L: -{res.breakdown.lockPen}</span>
                      <span>P: -{res.breakdown.pfPen}</span>
                      <span>S: -{res.breakdown.ctxPen}</span>
                    </div>

                    <div className="flex items-baseline gap-1 font-mono">
                      <span className="text-lg font-bold text-zinc-100">{res.score}</span>
                      <span className="text-xs text-zinc-600">/ 100</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600 font-mono pt-2">
                    Pending calculation...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
