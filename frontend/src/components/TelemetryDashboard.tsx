import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from "lucide-react";
import ScaleControl from "./ScaleControl";
import StressControl from "./StressControl";
import LogsPanel from "./LogsPanel";

export default function TelemetryDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [workloads, setWorkloads] = useState<string[]>([]);
  const [selectedWorkload, setSelectedWorkload] = useState('');

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

          const currentProfile = profiles.find((p: any) => p.WorkloadKey === (selectedWorkload || keys[0]));
          
          if (currentProfile) {
            setData(prev => {
              const newData = [...prev];
              if (newData.length >= 25) newData.shift();
              
              newData.push({
                time: new Date().toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' }),
                pageFaults: currentProfile.PageFaultRate || 0,
                cacheMisses: currentProfile.CacheMissRate || 0,
                lockContention: currentProfile.LockContentionRatio || 0,
                ctxSwitches: currentProfile.ContextSwitchRate || 0,
              });
              
              return newData;
            });
          }
        }
      } catch (err) {
        // Silent catch
      }
    };

    const interval = setInterval(fetchProfiles, 1000);
    return () => clearInterval(interval);
  }, [selectedWorkload]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-code border border-zinc-800 p-2.5 rounded text-xs font-mono">
          <p className="text-zinc-500 mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="flex justify-between gap-4">
              <span>{entry.name}:</span>
              <span>{Number(entry.value).toFixed(2)}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* High-Clarity Explanatory Banner */}
      <div className="p-4 rounded-lg bg-surface-1 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              TELEMETRY GUIDE
            </span>
            <h2 className="text-sm font-semibold text-zinc-100">
              Kernel-Level Microarchitectural Metrics
            </h2>
          </div>
          <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
            These four charts display real-time telemetry gathered directly from Linux kernel tracepoints and hardware performance counters (PMU). 
            AKIL aggregates these counters in a 60-second sliding window to detect contention before requests start timing out.
          </p>
        </div>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <ScaleControl />
          <StressControl />
        </div>
        <div className="lg:col-span-5">
          <LogsPanel />
        </div>
      </div>

      {/* Stream Selector Header */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="text-zinc-400 w-4 h-4" />
          <h2 className="text-sm font-semibold text-zinc-200 font-mono">
            LIVE KERNEL TELEMETRY STREAMS (:50051)
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-zinc-500">Target Cgroup:</span>
          <select 
            value={selectedWorkload}
            onChange={(e) => setSelectedWorkload(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded px-2.5 py-1.5 outline-none font-mono"
          >
            {workloads.length === 0 && <option>Waiting for collector stream...</option>}
            {workloads.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      {/* 4 Telemetry Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Memory Pressure */}
        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono text-zinc-300 font-semibold">PAGE FAULTS / SEC</span>
            <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
              tracepoint/exceptions
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="pageFaults" name="Page Faults" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cache Locality */}
        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono text-zinc-300 font-semibold">CACHE MISSES / SEC</span>
            <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
              PERF_COUNT_HW_CACHE_MISSES
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="cacheMisses" name="Cache Misses" stroke="#f43f5e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sync Overhead */}
        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono text-zinc-300 font-semibold">LOCK CONTENTION RATIO</span>
            <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
              tracepoint/lock/contention
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} domain={[0, 1]} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="lockContention" name="Contention Ratio" stroke="#a1a1aa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Context Switches */}
        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono text-zinc-300 font-semibold">CONTEXT SWITCHES / SEC</span>
            <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
              tracepoint/sched/sched_switch
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="ctxSwitches" name="Context Switches" stroke="#eab308" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
