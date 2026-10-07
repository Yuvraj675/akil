import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from "lucide-react";
import ScaleControl from "./ScaleControl";
import Walkthrough from "./Walkthrough";

export default function TelemetryDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [workloads, setWorkloads] = useState<string[]>([]);
  const [selectedWorkload, setSelectedWorkload] = useState('');

  // Fetch real-time telemetry data from the Aggregator backend
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
              if (newData.length >= 20) newData.shift();
              
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
        console.error("Failed to fetch profiles", err);
      }
    };

    const interval = setInterval(fetchProfiles, 1000);
    return () => clearInterval(interval);
  }, [selectedWorkload]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg shadow-xl">
          <p className="text-slate-300 text-sm mb-2 font-mono">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm font-semibold flex items-center justify-between gap-4">
              <span>{entry.name}:</span>
              <span>{entry.value.toFixed(2)} {entry.name === 'Lock Contention' ? 'ratio' : '/s'}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Walkthrough />
      <ScaleControl />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <Activity className="text-emerald-400" />
          <h2 className="text-lg font-semibold text-slate-100">Live Telemetry Streams (Aggregator Connected)</h2>
        </div>
        <select 
          value={selectedWorkload}
          onChange={(e) => setSelectedWorkload(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
        >
          {workloads.length === 0 && <option>Waiting for data...</option>}
          {workloads.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Memory Pressure */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm transition-all hover:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Memory Pressure
            </h3>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">Page Faults/sec</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickMargin={10} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="pageFaults" name="Page Faults" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cache Locality */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm transition-all hover:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Cache Locality
            </h3>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">Cache Misses/sec</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickMargin={10} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="cacheMisses" name="Cache Misses" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sync Overhead */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm transition-all hover:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span> Sync Overhead
            </h3>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">Lock Contention</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickMargin={10} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="lockContention" name="Lock Contention" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Context Switches */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm transition-all hover:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Context Switches
            </h3>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">Switches/sec</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickMargin={10} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="ctxSwitches" name="Context Switches" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
