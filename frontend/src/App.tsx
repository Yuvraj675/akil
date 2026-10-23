import { useState } from 'react';
import { Layers, Activity, Cpu, LayoutDashboard, BarChart3, Play, Wifi } from 'lucide-react';
import ConferenceDemo from './components/ConferenceDemo';
import TelemetryDashboard from './components/TelemetryDashboard';
import ArchitectureView from './components/ArchitectureView';
import SchedulingSim from './components/SchedulingSim';
import EvidenceExplorer from './components/EvidenceExplorer';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<'demo' | 'telemetry' | 'simulation' | 'evidence' | 'architecture'>('demo');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans bg-grid-pattern selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Professional App Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5">
        <div className="container mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 p-2.5 rounded-xl border border-emerald-500/30 shadow-lg shadow-emerald-950/30">
              <Layers className="text-emerald-400 w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                  AKIL
                </h1>
                <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-widest">
                  v1.29+ CO-RE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Adaptive Kernel Intelligence Layer for Kubernetes</p>
            </div>
          </div>
          
          {/* Navigation Bar */}
          <nav className="flex flex-wrap items-center bg-slate-900/90 rounded-xl p-1.5 border border-slate-800 shadow-inner">
            <button 
              onClick={() => setActiveTab('demo')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'demo' 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Conference Demo
            </button>
            <button 
              onClick={() => setActiveTab('evidence')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'evidence' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Paper Evidence
            </button>
            <button 
              onClick={() => setActiveTab('telemetry')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'telemetry' 
                  ? 'bg-slate-800 text-white shadow-md border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Live Telemetry
            </button>
            <button 
              onClick={() => setActiveTab('simulation')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'simulation' 
                  ? 'bg-slate-800 text-white shadow-md border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              Scorer Simulator
            </button>
            <button 
              onClick={() => setActiveTab('architecture')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'architecture' 
                  ? 'bg-slate-800 text-white shadow-md border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-amber-400" />
              Architecture
            </button>
          </nav>

          {/* Right Live Health Status Indicator */}
          <div className="hidden xl:flex items-center gap-3 text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>eBPF: <strong className="text-emerald-400 font-bold">4 Probes</strong></span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-800">
              <Wifi className="w-3 h-3 text-cyan-400" />
              <span>gRPC: <strong className="text-slate-200">:50051</strong></span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Presentation Surface */}
      <main className="flex-1 container mx-auto px-6 py-6 overflow-auto">
        {activeTab === 'demo' && <ConferenceDemo />}
        {activeTab === 'evidence' && <EvidenceExplorer />}
        {activeTab === 'telemetry' && <TelemetryDashboard />}
        {activeTab === 'simulation' && <SchedulingSim />}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* Footer Info */}
      <footer className="border-t border-slate-900 bg-slate-950/60 px-6 py-3 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <span>AKIL Project: Adaptive Kernel Intelligence Layer</span>
          <span>•</span>
          <span className="text-slate-400">IEEE Conference Submission</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Target Platform: Linux 5.8+ / Kubernetes v1.29+</span>
          <span>Cgroup v2 / CO-RE eBPF</span>
        </div>
      </footer>
    </div>
  );
}
