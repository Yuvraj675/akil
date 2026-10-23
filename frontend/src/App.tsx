import { useState } from 'react';
import { Layers, Activity, BarChart3, Cpu, Sliders, Server, Info } from 'lucide-react';
import OverviewFlow from './components/OverviewFlow';
import PodLifecycleView from './components/PodLifecycleView';
import EvidenceExplorer from './components/EvidenceExplorer';
import SchedulingSim from './components/SchedulingSim';
import TelemetryDashboard from './components/TelemetryDashboard';
import SystemAnatomy from './components/SystemAnatomy';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'pods' | 'telemetry' | 'sandbox' | 'evidence' | 'anatomy'>('overview');
  const [showGlobalInfo, setShowGlobalInfo] = useState(false);

  return (
    <div className="min-h-screen bg-[#0e1117] text-zinc-200 flex flex-col font-sans selection:bg-zinc-700 selection:text-zinc-100">
      {/* Top Application Header (Softened Charcoal / Slate) */}
      <header className="border-b border-zinc-800/80 bg-[#121620]/95 backdrop-blur sticky top-0 z-50 px-6 py-3">
        <div className="container mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="border border-zinc-700/80 bg-[#161c27] p-2 rounded">
              <Layers className="text-zinc-200 w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-zinc-100 font-mono">
                  AKIL
                </span>
                <span className="text-[10px] font-mono border border-zinc-700/60 px-1.5 py-0.2 rounded text-zinc-400 bg-[#181f2c]">
                  CO-RE v5.8+
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-normal">
                Adaptive Kernel Intelligence Layer for Kubernetes
              </p>
            </div>
          </div>
          
          {/* Segmented Control Navigation */}
          <nav className="flex items-center flex-wrap gap-1 border border-zinc-800 bg-[#151922] p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'overview' 
                  ? 'bg-zinc-200 text-zinc-950 font-bold shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Overview &amp; Flow
            </button>

            <button 
              onClick={() => setActiveTab('pods')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'pods' 
                  ? 'bg-zinc-200 text-zinc-950 font-bold shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Pod Scaling &amp; Lifecycle
            </button>

            <button 
              onClick={() => setActiveTab('telemetry')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'telemetry' 
                  ? 'bg-zinc-200 text-zinc-950 font-bold shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Live Telemetry
            </button>

            <button 
              onClick={() => setActiveTab('sandbox')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'sandbox' 
                  ? 'bg-zinc-200 text-zinc-950 font-bold shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Scorer Sandbox
            </button>

            <button 
              onClick={() => setActiveTab('evidence')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'evidence' 
                  ? 'bg-zinc-200 text-zinc-950 font-bold shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Evaluation Data
            </button>

            <button 
              onClick={() => setActiveTab('anatomy')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'anatomy' 
                  ? 'bg-zinc-200 text-zinc-950 font-bold shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              System Anatomy
            </button>
          </nav>

          {/* Right Status & Help Toggle */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowGlobalInfo(!showGlobalInfo)}
              className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1 bg-[#161c27] border border-zinc-800 px-2.5 py-1.5 rounded transition-colors"
              title="Toggle system quick guide"
            >
              <Info className="w-3.5 h-3.5 text-zinc-400" />
              <span>{showGlobalInfo ? 'Close Guide' : 'System Guide'}</span>
            </button>

            <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Kind: <strong className="text-zinc-300 font-normal">3 Nodes</strong>
              </span>
              <span className="text-zinc-700">/</span>
              <span>
                eBPF: <strong className="text-zinc-300 font-normal">Attached</strong>
              </span>
              <span className="text-zinc-700">/</span>
              <span>
                gRPC: <strong className="text-zinc-300 font-normal">:50051</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Global Expandable System Guide */}
        {showGlobalInfo && (
          <div className="mt-3 pt-3 border-t border-zinc-800/80 container mx-auto">
            <div className="p-4 rounded-lg bg-[#151922] border border-zinc-800 text-xs text-zinc-300 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <strong className="text-zinc-100 font-mono block mb-1">What does this system do?</strong>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  AKIL attaches lightweight eBPF kernel probes on every Kubernetes node to observe hardware memory bus contention (LLC cache misses, lock wait times, and context switches) and feeds this to the scheduler and autoscaler.
                </p>
              </div>
              <div>
                <strong className="text-zinc-100 font-mono block mb-1">Where are the Pods?</strong>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Head over to the <strong className="text-zinc-200">Pod Scaling &amp; Lifecycle</strong> tab. You will see every active pod, its host node, and can simulate contention spikes to watch new pods spawn or scale down.
                </p>
              </div>
              <div>
                <strong className="text-zinc-100 font-mono block mb-1">What are the key benefits?</strong>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Eliminates noisy-neighbor interference, reduces p99 tail latency from 63ms to 20ms (a 68% drop), and achieves sub-second autoscaling before users experience degradations.
                </p>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Presentation Surface */}
      <main className="flex-1 container mx-auto px-6 py-8 overflow-auto">
        {activeTab === 'overview' && <OverviewFlow />}
        {activeTab === 'pods' && <PodLifecycleView />}
        {activeTab === 'evidence' && <EvidenceExplorer />}
        {activeTab === 'sandbox' && <SchedulingSim />}
        {activeTab === 'telemetry' && <TelemetryDashboard />}
        {activeTab === 'anatomy' && <SystemAnatomy />}
      </main>

      {/* Softened Clean Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#10131a] px-6 py-4 text-xs font-mono text-zinc-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div>
          Adaptive Kernel Intelligence Layer (AKIL) · IEEE Conference Manuscript
        </div>
        <div className="flex items-center gap-4 text-zinc-500">
          <span>Linux 5.8+ BTF</span>
          <span>kube-scheduler v1.29+</span>
          <span>16MB BPF RingBuf</span>
        </div>
      </footer>
    </div>
  );
}
