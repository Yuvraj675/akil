import { useState } from 'react';
import { Cpu, Server, Activity, ArrowRight, CheckCircle2 } from 'lucide-react';

const NODES = [
  { id: 'node-1', name: 'worker-node-01', existingWorkloads: ['redis-cache', 'nginx'], cacheLoad: 85, lockLoad: 60, pfLoad: 30, ctxLoad: 40 },
  { id: 'node-2', name: 'worker-node-02', existingWorkloads: ['batch-processor'], cacheLoad: 20, lockLoad: 15, pfLoad: 75, ctxLoad: 30 },
  { id: 'node-3', name: 'worker-node-03', existingWorkloads: ['postgres-db'], cacheLoad: 60, lockLoad: 80, pfLoad: 50, ctxLoad: 70 },
];

export default function SchedulingSim() {
  const [candidate, setCandidate] = useState('redis-clone');
  const [isScoring, setIsScoring] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});

  const profiles: Record<string, any> = {
    'redis-clone': { cache: 90, lock: 70, pf: 20, ctx: 50 },
    'web-api': { cache: 30, lock: 20, pf: 40, ctx: 80 },
    'data-miner': { cache: 40, lock: 10, pf: 90, ctx: 20 },
  };

  const handleSimulate = () => {
    setIsScoring(true);
    setScores({});
    
    // Simulate scheduling delay
    setTimeout(() => {
      const candProfile = profiles[candidate];
      const newScores: Record<string, number> = {};
      
      NODES.forEach(node => {
        // Simple penalty formula for simulation
        const cachePenalty = Math.min(candProfile.cache, node.cacheLoad) * 0.35;
        const lockPenalty = (candProfile.lock + node.lockLoad) * 0.15;
        const pfPenalty = (candProfile.pf + node.pfLoad) * 0.20;
        const ctxPenalty = (candProfile.ctx + node.ctxLoad) * 0.10;
        
        const totalPenalty = cachePenalty + lockPenalty + pfPenalty + ctxPenalty;
        newScores[node.id] = Math.max(0, Math.round(100 - totalPenalty));
      });
      
      setScores(newScores);
      setIsScoring(false);
    }, 800);
  };

  const getBestNode = () => {
    if (Object.keys(scores).length === 0) return null;
    return Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  };
  
  const bestNode = getBestNode();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
        <h2 className="text-xl font-semibold mb-4 text-slate-100 flex items-center gap-2">
          <Cpu className="text-emerald-400" /> AKIL Score Plugin Simulator
        </h2>
        
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-1 bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg w-full">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Incoming Pod (Candidate)</h3>
            <select 
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 outline-none focus:border-emerald-500 mb-4"
            >
              <option value="redis-clone">redis-clone (High Cache/Lock)</option>
              <option value="web-api">web-api (High Ctx Switch)</option>
              <option value="data-miner">data-miner (High Page Faults)</option>
            </select>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900 p-2 rounded text-slate-400">Cache: <span className="text-rose-400 font-mono">{profiles[candidate].cache}%</span></div>
              <div className="bg-slate-900 p-2 rounded text-slate-400">Lock: <span className="text-purple-400 font-mono">{profiles[candidate].lock}%</span></div>
              <div className="bg-slate-900 p-2 rounded text-slate-400">Memory: <span className="text-blue-400 font-mono">{profiles[candidate].pf}%</span></div>
              <div className="bg-slate-900 p-2 rounded text-slate-400">CtxSw: <span className="text-amber-400 font-mono">{profiles[candidate].ctx}%</span></div>
            </div>
            
            <button 
              onClick={handleSimulate}
              disabled={isScoring}
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isScoring ? <Activity className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isScoring ? 'Scoring Nodes...' : 'Run Scheduling Cycle'}
            </button>
          </div>
          
          <div className="flex-[2] grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            {NODES.map(node => (
              <div key={node.id} className={`bg-slate-800/50 border ${bestNode === node.id ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700/50'} p-4 rounded-lg flex flex-col relative overflow-hidden`}>
                {bestNode === node.id && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> SELECTED
                  </div>
                )}
                
                <h3 className="text-sm font-medium text-slate-200 mb-1 flex items-center gap-2">
                  <Server className="w-4 h-4 text-slate-400" /> {node.name}
                </h3>
                <p className="text-xs text-slate-500 mb-3">Running: {node.existingWorkloads.join(', ')}</p>
                
                <div className="space-y-2 mt-auto">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Cache Load</span>
                    <div className="w-16 h-1.5 bg-slate-900 rounded-full overflow-hidden"><div className="h-full bg-rose-500" style={{width: `${node.cacheLoad}%`}}></div></div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Lock Load</span>
                    <div className="w-16 h-1.5 bg-slate-900 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{width: `${node.lockLoad}%`}}></div></div>
                  </div>
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-end justify-between">
                  <span className="text-xs text-slate-400">AKIL Score</span>
                  <span className={`text-2xl font-bold font-mono ${scores[node.id] ? (bestNode === node.id ? 'text-emerald-400' : 'text-slate-300') : 'text-slate-600'}`}>
                    {scores[node.id] !== undefined ? scores[node.id] : '--'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {bestNode && (
        <div className="bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-emerald-400 font-medium text-sm">Placement Decision Rationale</h4>
            <p className="text-slate-300 text-sm mt-1">
              Pod <span className="font-mono text-emerald-300">{candidate}</span> was scheduled to <span className="font-mono text-emerald-300">{NODES.find(n => n.id === bestNode)?.name}</span>. 
              {candidate === 'redis-clone' && " Node 2 was selected because Node 1 already has a cache-heavy workload (redis-cache), which would cause severe LLC thrashing if co-located. Node 3 has high lock contention, which would compound with redis's lock usage."}
              {candidate === 'web-api' && " The workload is CPU-bound with high context switching. It avoids nodes with high existing context switch overhead to minimize scheduler latency."}
              {candidate === 'data-miner' && " High page fault workloads require nodes with available memory bandwidth. The scheduler avoided nodes with existing memory pressure."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
