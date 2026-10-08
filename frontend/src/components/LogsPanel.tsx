import { useState, useEffect, useRef } from "react";
import { Terminal, Activity, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';

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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col h-[400px]">
      <div className="flex items-center gap-2 mb-4">
        <Terminal className="text-emerald-400 w-5 h-5" />
        <h3 className="font-semibold text-slate-100">Live Autoscaler Logs</h3>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-slate-950 rounded-lg p-4 font-mono text-xs md:text-sm border border-slate-800 space-y-3 scroll-smooth"
      >
        {logs.length === 0 && (
          <div className="text-slate-500 italic h-full flex items-center justify-center">
            Waiting for scaling events...
          </div>
        )}
        
        {logs.map((log, idx) => {
          let Icon = Info;
          let color = "text-blue-400";
          let bg = "bg-blue-400/10";
          
          if (log.action.includes("SCALE UP")) {
            Icon = ArrowUpRight;
            color = "text-rose-400";
            bg = "bg-rose-400/10";
          } else if (log.action.includes("SCALE DOWN")) {
            Icon = ArrowDownRight;
            color = "text-emerald-400";
            bg = "bg-emerald-400/10";
          }

          const timeStr = new Date(log.timestamp).toLocaleTimeString([], { 
            hour12: false, 
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          return (
            <div key={idx} className={`p-3 rounded border border-slate-800/50 ${bg} flex gap-3`}>
              <div className={`mt-0.5 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold ${color}`}>{log.action}</span>
                  <span className="text-slate-500 text-xs">{timeStr}</span>
                </div>
                <p className="text-slate-300">{log.reason}</p>
                {log.replicas >= 0 && (
                  <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Target Replicas: {log.replicas}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
