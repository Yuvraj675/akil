import { useState, useEffect } from "react";
import { Zap, Plus, Cpu, HardDrive, Gauge } from 'lucide-react';
import { motion } from "framer-motion";

export default function StressControl() {
  const [workloads, setWorkloads] = useState<string[]>([]);
  const [selectedWorkload, setSelectedWorkload] = useState('');
  const [newPodName, setNewPodName] = useState('');
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);

  // Fetch available workloads
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/profiles');
        if (!res.ok) return;
        const profiles = await res.json();
        if (profiles && profiles.length > 0) {
          const keys = profiles.map((p: any) => p.WorkloadKey);
          setWorkloads(keys);
          
          setWorkloads(prev => {
            if (!selectedWorkload && keys.length > 0) {
              const demo = keys.find((k: string) => k.includes('demo-workload'));
              setSelectedWorkload(demo || keys[0]);
            }
            return keys;
          });
        }
      } catch (err) {
        // silent
      }
    };
    fetchProfiles();
    const int = setInterval(fetchProfiles, 5000);
    return () => clearInterval(int);
  }, []);

  const handleCreatePod = async () => {
    if (!newPodName) return;
    setLoading(true);
    try {
      await fetch(`http://localhost:8080/api/pods/create?name=${newPodName}`, { method: 'POST' });
      setWorkloads(prev => Array.from(new Set([...prev, newPodName])));
      setSelectedWorkload(newPodName);
      setNewPodName('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const simulateStress = async (type: string) => {
    setSimulating(type);
    
    // Default payload
    let payload = {
      workload_key: selectedWorkload,
      node_name: "akil-demo-control-plane",
      page_faults: 0,
      cache_misses: 0,
      lock_ns: 0,
      ctx_switches: 0
    };

    if (type === 'memory_leak') {
      payload.page_faults = 150000;
      payload.cache_misses = 10000;
    } else if (type === 'cache_thrash') {
      payload.cache_misses = 30000;
      payload.page_faults = 20000;
    } else if (type === 'cpu_contention') {
      payload.ctx_switches = 2500;
      payload.lock_ns = 5000000;
    } else if (type === 'mixed') {
      payload.page_faults = 100000;
      payload.ctx_switches = 2000;
    }

    try {
      // Send bursts over 3 seconds
      for (let i = 0; i < 3; i++) {
        await fetch('http://localhost:8080/api/simulate-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(null);
    }
  };

  const normalizeLoad = async () => {
    setSimulating('normalizing');
    try {
      await fetch('http://localhost:8080/api/reset-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workload_key: selectedWorkload })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Zap className="text-amber-400 w-5 h-5" />
        <h2 className="text-lg font-semibold text-slate-100">Workload Stress Simulator</h2>
      </div>

      <div className="space-y-6">
        {/* Target Selection */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
          <div className="mb-3">
            <label className="block text-sm font-bold text-slate-200">1. Select Target Workload</label>
            <p className="text-xs text-slate-400 mt-1">
              Choose an existing Kubernetes Pod from the dropdown, or type a name and click '+' to deploy a brand new Pod into the cluster. The dropdown shows workloads currently tracked by the aggregator.
            </p>
          </div>
          <div className="flex gap-3">
            <select 
              value={selectedWorkload}
              onChange={(e) => setSelectedWorkload(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 outline-none focus:border-emerald-500"
            >
              {workloads.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            
            <div className="flex gap-2 w-full max-w-[250px]">
              <input 
                type="text" 
                placeholder="New Pod Name"
                value={newPodName}
                onChange={e => setNewPodName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 outline-none focus:border-emerald-500"
              />
              <button 
                onClick={handleCreatePod}
                disabled={loading || !newPodName}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-2.5 rounded-lg flex items-center justify-center transition-colors"
                title="Deploy New Pod"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stress Profiles */}
        <div>
          <div className="mb-3">
            <label className="block text-sm font-bold text-slate-200">2. Inject Telemetry (Simulate Stress)</label>
            <p className="text-xs text-slate-400 mt-1">
              Clicking these buttons does not actually stress your laptop! Instead, it safely injects fake eBPF metrics (like thousands of page faults) directly into the API for the selected Pod. If you have "Adaptive Autoscaling" turned ON above, this will force the autoscaler to scale the pod UP to handle the fake load.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={simulating !== null}
              onClick={() => simulateStress('memory_leak')}
              className={`p-4 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                simulating === 'memory_leak' 
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-200' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-blue-500/50'
              }`}
            >
              <HardDrive className={`w-5 h-5 mt-0.5 ${simulating === 'memory_leak' ? 'text-blue-400 animate-pulse' : 'text-slate-400'}`} />
              <div>
                <div className="font-semibold text-sm mb-1">Memory Leak</div>
                <div className="text-xs opacity-70">Spikes Page Faults (&gt;8000/s)</div>
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={simulating !== null}
              onClick={() => simulateStress('cache_thrash')}
              className={`p-4 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                simulating === 'cache_thrash' 
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-200' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-rose-500/50'
              }`}
            >
              <Zap className={`w-5 h-5 mt-0.5 ${simulating === 'cache_thrash' ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
              <div>
                <div className="font-semibold text-sm mb-1">Cache Thrashing</div>
                <div className="text-xs opacity-70">Spikes Cache Misses (&gt;1000/s)</div>
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={simulating !== null}
              onClick={() => simulateStress('cpu_contention')}
              className={`p-4 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                simulating === 'cpu_contention' 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-amber-500/50'
              }`}
            >
              <Cpu className={`w-5 h-5 mt-0.5 ${simulating === 'cpu_contention' ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
              <div>
                <div className="font-semibold text-sm mb-1">CPU Contention</div>
                <div className="text-xs opacity-70">Spikes Context Switches (&gt;100/s)</div>
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={simulating !== null}
              onClick={() => simulateStress('mixed')}
              className={`p-4 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                simulating === 'mixed' 
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-200' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-purple-500/50'
              }`}
            >
              <Gauge className={`w-5 h-5 mt-0.5 ${simulating === 'mixed' ? 'text-purple-400 animate-pulse' : 'text-slate-400'}`} />
              <div>
                <div className="font-semibold text-sm mb-1">Mixed Workload</div>
                <div className="text-xs opacity-70">High Faults + Context Switches</div>
              </div>
            </motion.button>

          </div>
          <div className="mt-4">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              disabled={simulating !== null}
              onClick={normalizeLoad}
              className={`w-full p-4 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                simulating === 'normalizing' 
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-emerald-500/50'
              }`}
            >
              <Zap className={`w-5 h-5 mt-0.5 ${simulating === 'normalizing' ? 'text-emerald-400 animate-spin' : 'text-emerald-400'}`} />
              <div>
                <div className="font-semibold text-sm mb-1 text-emerald-400">Normalize Load (Relieve Stress)</div>
                <div className="text-xs opacity-70">Clears all simulated telemetry from the aggregator. The autoscaler will immediately scale down because it detects zero metrics. <b>Unlike standard K8s HPA which only scales based on raw CPU/Memory averages, AKIL makes targeted decisions based on granular kernel metrics (like Cache Misses and Lock Contention) which standard K8s is blind to!</b></div>
              </div>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
