import { useState, useEffect, useRef } from "react";
import { Terminal } from 'lucide-react';

interface ScalingLog {
  timestamp: string;
  action: string;
  reason: string;
  replicas: number;
}

export default function LogsPanel() {
  const [logs, setLogs] = useState<ScalingLog[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/logs');
        if (!res.ok) return;
        const data = await res.json();
        setLogs(data || []);
      } catch (err) {
        // Silent catch
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-5 flex flex-col h-[340px]">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <Terminal className="text-zinc-400 w-4 h-4" />
          <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider">
            Adaptive Autoscaling Engine Logs
          </h3>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">Live Buffer</span>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-surface-code rounded p-3 font-mono text-xs border border-zinc-800 space-y-2.5"
      >
        {logs.length === 0 && (
          <div className="text-zinc-600 italic h-full flex items-center justify-center font-mono text-xs">
            Awaiting telemetry-triggered scaling events...
          </div>
        )}
        
        {logs.map((log, idx) => {
          const isUp = log.action.includes("SCALE UP");
          const isDown = log.action.includes("SCALE DOWN");
          
          const timeStr = new Date(log.timestamp).toLocaleTimeString([], { 
            hour12: false, 
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          return (
            <div key={idx} className="p-2.5 rounded border border-zinc-800/60 bg-zinc-900/30 font-mono text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold ${isUp ? 'text-rose-400' : isDown ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  [{log.action}]
                </span>
                <span className="text-zinc-500 text-[10px]">{timeStr}</span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">{log.reason}</p>
              {log.replicas >= 0 && (
                <div className="mt-1 text-[10px] text-zinc-500">
                  Target Replicas: <strong className="text-zinc-300">{log.replicas}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
