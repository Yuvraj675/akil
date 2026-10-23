import { useState, useEffect } from "react";
import { Plus, Flame, Cpu, Layers, RefreshCw } from 'lucide-react';

export default function StressControl() {
  const [workloads, setWorkloads] = useState<string[]>([]);
  const [selectedWorkload, setSelectedWorkload] = useState('');
  const [newPodName, setNewPodName] = useState('');
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/profiles');
        if (!res.ok) return;
        const profiles = await res.json();
        if (profiles && profiles.length > 0) {
          const keys = profiles.map((p: any) => p.WorkloadKey);
          setWorkloads(keys);
          if (!selectedWorkload && keys.length > 0) {
            const demo = keys.find((k: string) => k.includes('demo-workload'));
            setSelectedWorkload(demo || keys[0]);
          }
        }
      } catch (err) {
        // Silent catch
      }
    };
    fetchProfiles();
    const int = setInterval(fetchProfiles, 5000);
    return () => clearInterval(int);
  }, [selectedWorkload]);

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
    const payload = {
      workload_key: selectedWorkload,
      node_name: "worker-node-01",
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
    }

    try {
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
    <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">
            HARDWARE COUNTER STRESS INJECTOR
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">
            Microarchitectural Contention Simulation
          </h3>
        </div>

        <select
          value={selectedWorkload}
          onChange={(e) => setSelectedWorkload(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded p-2 outline-none font-mono"
        >
          {workloads.map(w => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => simulateStress('cache_thrash')}
          disabled={simulating !== null}
          className="border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 text-zinc-300 p-2.5 rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Flame className="w-3.5 h-3.5 text-zinc-400" />
          LLC Misses
        </button>

        <button
          onClick={() => simulateStress('cpu_contention')}
          disabled={simulating !== null}
          className="border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 text-zinc-300 p-2.5 rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Cpu className="w-3.5 h-3.5 text-zinc-400" />
          Mutex Storm
        </button>

        <button
          onClick={() => simulateStress('memory_leak')}
          disabled={simulating !== null}
          className="border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 text-zinc-300 p-2.5 rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Layers className="w-3.5 h-3.5 text-zinc-400" />
          Page Faults
        </button>

        <button
          onClick={normalizeLoad}
          disabled={simulating !== null}
          className="border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 text-zinc-300 p-2.5 rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          Normalize
        </button>
      </div>

      <div className="flex gap-2 pt-2 border-t border-zinc-800/80">
        <input
          type="text"
          placeholder="New Pod Name (e.g. redis-cache-2)"
          value={newPodName}
          onChange={(e) => setNewPodName(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 outline-none font-mono"
        />
        <button
          onClick={handleCreatePod}
          disabled={loading || !newPodName}
          className="border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Deploy Pod
        </button>
      </div>
    </div>
  );
}
