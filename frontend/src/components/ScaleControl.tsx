import { useState, useEffect } from "react";
import { Server } from 'lucide-react';

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
        // Silent catch
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
    <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">
            KUBERNETES WORKLOAD CONTROLLER
          </div>
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Server className="w-4 h-4 text-zinc-400" />
            Deployment Replica Allocation
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400">Target Replicas:</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(num => (
              <button
                key={num}
                disabled={loading || autoScalingEnabled}
                onClick={() => handleScale(num)}
                className={`w-8 h-8 rounded text-xs font-mono transition-colors border ${
                  replicas === num
                    ? 'bg-zinc-100 text-black font-semibold border-zinc-100'
                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              const newState = !autoScalingEnabled;
              setAutoScalingEnabled(newState);
              await fetch(`http://localhost:8080/api/autoscale/${newState ? 'enable' : 'disable'}`, { method: 'POST' });
            }}
            className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${autoScalingEnabled ? 'bg-zinc-200' : 'bg-zinc-800'}`}
          >
            <span className={`w-4 h-4 rounded-full bg-zinc-950 transition-transform ${autoScalingEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-zinc-300 font-mono text-xs">eBPF Telemetry-Driven Adaptive Autoscaling</span>
        </div>
        <span className="text-[11px] font-mono text-zinc-500">
          Thresholds: CtxSw &gt; 100/s · PF &gt; 5000/s · Cache &gt; 1000/s
        </span>
      </div>
    </div>
  );
}
