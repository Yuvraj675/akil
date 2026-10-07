import { useState, useEffect } from "react";
import { motion } from 'framer-motion';
import { Server, Zap, Activity, HardDrive } from 'lucide-react';

export default function ScaleControl() {
  const [replicas, setReplicas] = useState(1);
  const [loading, setLoading] = useState(false);
  const [autoScalingEnabled, setAutoScalingEnabled] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/scale');
        const data = await res.json();
        setReplicas(data.replicas || 1);
        
        const resAuto = await fetch('http://localhost:8080/api/autoscale/status');
        const dataAuto = await resAuto.json();
        setAutoScalingEnabled(dataAuto.enabled || false);
      } catch (err) {
        console.error("Failed to fetch scale data", err);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleScale = async (newReplicas: number) => {
    if (newReplicas === replicas || loading) return;
    setLoading(true);
    try {
      await fetch(`http://localhost:8080/api/scale?replicas=${newReplicas}`, {
        method: 'POST',
      });
      setReplicas(newReplicas);
    } catch (err) {
      console.error("Failed to scale", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2 mb-2">
            <Server className="text-blue-400" />
            Live Demo: Workload Scaling
          </h2>
          <p className="text-sm text-slate-400 max-w-xl">
            Scale the <code className="text-xs bg-slate-800 px-1 py-0.5 rounded text-blue-300">demo-workload</code> deployment from 1 to 4 pods. Watch the metrics in the dashboard react in real-time as the simulated noisy neighbor effect causes cache thrashing and lock contention to rise exponentially.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800">
          <div className="flex flex-col items-center justify-center mr-4">
            <span className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1">Replicas</span>
            <span className="text-3xl font-bold text-slate-100">{replicas}</span>
          </div>

          <div className="flex gap-2">
            {[1, 2, 3, 4].map(num => (
              <motion.button
                key={num}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={loading || autoScalingEnabled}
                onClick={() => handleScale(num)}
                className={`w-12 h-12 rounded-lg font-medium text-lg flex items-center justify-center transition-colors ${
                  replicas === num
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 border border-blue-400'
                    : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {num}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={async () => {
            const newState = !autoScalingEnabled;
            setAutoScalingEnabled(newState);
            await fetch(`http://localhost:8080/api/autoscale/${newState ? 'enable' : 'disable'}`, { method: 'POST' });
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoScalingEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoScalingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className="text-sm text-slate-300 font-medium">Enable eBPF Adaptive Autoscaling (Max 5 Pods)</span>
      </div>
      
      {/* Visual representation */}
      <div className="mt-6 pt-6 border-t border-slate-800">
        <h3 className="text-sm font-medium text-slate-400 mb-4">Node Allocation</h3>
        <div className="flex gap-3 flex-wrap">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-slate-300">akil-demo-control-plane</span>
              <Activity className={`w-4 h-4 ${replicas > 2 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: replicas }).map((_, i) => (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  key={i}
                  className={`px-3 py-2 rounded border flex items-center gap-2 ${
                    replicas > 3 ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
                    replicas > 2 ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                    'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  <HardDrive className="w-4 h-4" />
                  <span className="text-xs font-medium">Pod-{i+1}</span>
                </motion.div>
              ))}
            </div>
            
            {replicas > 2 && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-rose-400 mt-3 flex items-center gap-1"
              >
                <Zap className="w-3 h-3" /> High contention detected
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
