import { useState } from 'react';
import { Activity, Layers, Cpu, LayoutDashboard } from 'lucide-react';
import TelemetryDashboard from './components/TelemetryDashboard';
import ArchitectureView from './components/ArchitectureView';
import SchedulingSim from './components/SchedulingSim';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('architecture');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/50 p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              <Layers className="text-emerald-400 w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                AKIL
              </h1>
              <p className="text-xs text-slate-400">Adaptive Kernel Intelligence Layer</p>
            </div>
          </div>
          
          <nav className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button 
              onClick={() => setActiveTab('architecture')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'architecture' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Architecture
            </button>
            <button 
              onClick={() => setActiveTab('telemetry')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'telemetry' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Activity className="w-4 h-4" />
              Telemetry Data
            </button>
            <button 
              onClick={() => setActiveTab('simulation')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'simulation' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Cpu className="w-4 h-4" />
              Scheduler Sim
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-6 overflow-auto">
        {activeTab === 'architecture' && <ArchitectureView />}
        {activeTab === 'telemetry' && <TelemetryDashboard />}
        {activeTab === 'simulation' && <SchedulingSim />}
      </main>
    </div>
  );
}

export default App;
