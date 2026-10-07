import { Database, Server, Cpu, Activity, Share2, Layers, AlertCircle } from 'lucide-react';

export default function ArchitectureView() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4 text-slate-100 flex items-center gap-2">
          <Share2 className="text-emerald-400" /> System Architecture
        </h2>
        <p className="text-slate-400 mb-8 max-w-3xl">
          AKIL extends the Kubernetes scheduler by bridging the gap between OS-level kernel metrics and container placement decisions. It uses eBPF to gather highly accurate data without modifying application code.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          
          {/* Layer 1 */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 flex flex-col items-center text-center relative z-10">
            <div className="bg-rose-500/10 p-3 rounded-full mb-4 border border-rose-500/20">
              <Cpu className="text-rose-400 w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-200">Layer 1: eBPF Probes</h3>
            <p className="text-xs text-slate-400 mt-2">Kernel Space</p>
            <ul className="text-xs text-left mt-4 space-y-2 text-slate-300 w-full bg-slate-900/50 p-3 rounded border border-slate-700/50">
              <li className="flex items-center gap-2"><Activity className="w-3 h-3 text-rose-400" /> Page Faults</li>
              <li className="flex items-center gap-2"><Activity className="w-3 h-3 text-rose-400" /> Cache Misses</li>
              <li className="flex items-center gap-2"><Activity className="w-3 h-3 text-rose-400" /> Lock Contention</li>
              <li className="flex items-center gap-2"><Activity className="w-3 h-3 text-rose-400" /> Context Switches</li>
            </ul>
          </div>

          {/* Layer 2 */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 flex flex-col items-center text-center relative z-10">
            <div className="bg-blue-500/10 p-3 rounded-full mb-4 border border-blue-500/20">
              <Server className="text-blue-400 w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-200">Layer 2: Collector</h3>
            <p className="text-xs text-slate-400 mt-2">DaemonSet (Go)</p>
            <div className="mt-4 text-xs text-slate-300 w-full bg-slate-900/50 p-3 rounded border border-slate-700/50">
              Reads Ring Buffer, maps Cgroups to Pods, streams batches.
            </div>
          </div>

          {/* Layer 3 */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 flex flex-col items-center text-center relative z-10">
            <div className="bg-purple-500/10 p-3 rounded-full mb-4 border border-purple-500/20">
              <Database className="text-purple-400 w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-200">Layer 3: Aggregator</h3>
            <p className="text-xs text-slate-400 mt-2">Control Plane Service</p>
            <div className="mt-4 text-xs text-slate-300 w-full bg-slate-900/50 p-3 rounded border border-slate-700/50">
              Maintains 60s sliding window of workload runtime profiles.
            </div>
          </div>

          {/* Layer 4 */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 flex flex-col items-center text-center relative z-10">
            <div className="bg-emerald-500/10 p-3 rounded-full mb-4 border border-emerald-500/20">
              <Layers className="text-emerald-400 w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-200">Layer 4: Scheduler</h3>
            <p className="text-xs text-slate-400 mt-2">K8s Score Plugin</p>
            <div className="mt-4 text-xs text-slate-300 w-full bg-slate-900/50 p-3 rounded border border-slate-700/50">
              Computes placement penalties based on co-location risks.
            </div>
          </div>
          
          {/* Connection Lines (Visible on md+) */}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-slate-700/50 -z-0 -translate-y-1/2"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400" /> The Problem
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Default Kubernetes scheduling relies on static resource requests (CPU/Memory). It is blind to dynamic runtime behavior like cache thrashing or NUMA latency. This causes unpredictable performance degradation when "noisy neighbors" are placed on the same node despite having identical static requests.
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-400" /> The AKIL Solution
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            By closing the observability gap, AKIL dynamically scores candidate nodes by evaluating the runtime profiles of the candidate pod against existing pods on the node. It calculates co-location penalties for cache, locks, memory pressure, and context switches.
          </p>
        </div>
      </div>
    </div>
  );
}
