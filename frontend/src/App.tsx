import { useState } from 'react';
import { Layers, Activity, BarChart3, Cpu, Sliders } from 'lucide-react';
import OverviewFlow from './components/OverviewFlow';
import EvidenceExplorer from './components/EvidenceExplorer';
import SchedulingSim from './components/SchedulingSim';
import TelemetryDashboard from './components/TelemetryDashboard';
import SystemAnatomy from './components/SystemAnatomy';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'sandbox' | 'telemetry' | 'anatomy'>('overview');

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
      {/* Top Professional App Header */}
      <header className="border-b border-zinc-800 bg-black/95 sticky top-0 z-50 px-6 py-3">
        <div className="container mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="border border-zinc-800 bg-zinc-950 p-2 rounded">
              <Layers className="text-zinc-100 w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-white font-mono">
                  AKIL
                </span>
                <span className="text-[10px] font-mono border border-zinc-800 px-1.5 py-0.2 rounded text-zinc-400 bg-zinc-950">
                  CO-RE v5.8+
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-normal">
                Adaptive Kernel Intelligence Layer for Kubernetes
              </p>
            </div>
          </div>
          
          {/* Segmented Control Navigation (Vercel Style) */}
          <nav className="flex items-center border border-zinc-800 bg-zinc-950 p-1 rounded">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'overview' 
                  ? 'bg-zinc-100 text-black font-semibold' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Overview &amp; Flow
            </button>
            <button 
              onClick={() => setActiveTab('evidence')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'evidence' 
                  ? 'bg-zinc-100 text-black font-semibold' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Evaluation Data
            </button>
            <button 
              onClick={() => setActiveTab('sandbox')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'sandbox' 
                  ? 'bg-zinc-100 text-black font-semibold' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Scorer Sandbox
            </button>
            <button 
              onClick={() => setActiveTab('telemetry')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'telemetry' 
                  ? 'bg-zinc-100 text-black font-semibold' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Live Telemetry
            </button>
            <button 
              onClick={() => setActiveTab('anatomy')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                activeTab === 'anatomy' 
                  ? 'bg-zinc-100 text-black font-semibold' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              System Anatomy
            </button>
          </nav>

          {/* Right Live Cluster Status */}
          <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
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
      </header>

      {/* Main Presentation Surface */}
      <main className="flex-1 container mx-auto px-6 py-8 overflow-auto">
        {activeTab === 'overview' && <OverviewFlow />}
        {activeTab === 'evidence' && <EvidenceExplorer />}
        {activeTab === 'sandbox' && <SchedulingSim />}
        {activeTab === 'telemetry' && <TelemetryDashboard />}
        {activeTab === 'anatomy' && <SystemAnatomy />}
      </main>

      {/* Clean Vercel-style Footer */}
      <footer className="border-t border-zinc-900 bg-black px-6 py-4 text-xs font-mono text-zinc-600 flex flex-col sm:flex-row justify-between items-center gap-2">
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
