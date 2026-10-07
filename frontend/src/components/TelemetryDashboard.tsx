import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';

const WORKLOADS = ['default/Deployment/nginx-frontend', 'data/StatefulSet/redis-cache', 'jobs/Job/batch-processor'];

export default function TelemetryDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [selectedWorkload, setSelectedWorkload] = useState(WORKLOADS[0]);

  // Simulate real-time telemetry data
  useEffect(() => {
    // Initial data
    const initialData = Array.from({ length: 20 }).map((_, i) => ({
      time: new Date(Date.now() - (20 - i) * 1000).toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' }),
      pageFaults: Math.random() * 100 + (selectedWorkload.includes('redis') ? 200 : 50),
      cacheMisses: Math.random() * 50 + (selectedWorkload.includes('batch') ? 150 : 20),
      lockContention: Math.random() * 10 + (selectedWorkload.includes('redis') ? 30 : 5),
      ctxSwitches: Math.random() * 500 + 1000,
    }));
    setData(initialData);

    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev.slice(1)];
        newData.push({
          time: new Date().toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' }),
          pageFaults: Math.random() * 100 + (selectedWorkload.includes('redis') ? 200 : 50),
          cacheMisses: Math.random() * 50 + (selectedWorkload.includes('batch') ? 150 : 20),
          lockContention: Math.random() * 10 + (selectedWorkload.includes('redis') ? 30 : 5),
          ctxSwitches: Math.random() * 500 + 1000,
        });
        return newData;
      });
    }, 1000);

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
              <span>{entry.value.toFixed(0)} /s</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <Activity className="text-emerald-400" />
          <h2 className="text-lg font-semibold text-slate-100">Live Telemetry Streams</h2>
        </div>
        <select 
          value={selectedWorkload}
          onChange={(e) => setSelectedWorkload(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
        >
          {WORKLOADS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Memory Pressure */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
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
