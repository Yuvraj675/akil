import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Terminal, Zap, Server, Activity } from 'lucide-react';

export default function Walkthrough() {
  const [step, setStep] = useState(1);

  const steps = [
    {
      id: 1,
      title: "1. The Single Docker Node",
      icon: <Server className="w-5 h-5 text-purple-400" />,
      content: "Why do you only see one Docker container running on your machine? Because we use Kind (Kubernetes in Docker). Kind runs an entire Kubernetes cluster inside that single container. All the Pod scaling happens natively inside this isolated environment.",
    },
    {
      id: 2,
      title: "2. Visualizing Scale",
      icon: <Terminal className="w-5 h-5 text-emerald-400" />,
      content: "The 'Live Demo: Workload Scaling' panel shows you the exact number of Pods currently running in the cluster. You can manually scale the default demo workload from 1 to 4 pods, and watch them appear physically on the 'Node Allocation' map.",
    },
    {
      id: 3,
      title: "3. Simulating Stress",
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      content: "The 'Workload Stress Simulator' lets you target a specific Pod (or create a brand new one). Clicking a button like 'Memory Leak' injects simulated eBPF telemetry directly into the aggregator. You will immediately see the graphs below spike, completely safely without actually stressing your laptop's CPU/RAM.",
    },
    {
      id: 4,
      title: "4. Adaptive Autoscaling",
      icon: <Activity className="w-5 h-5 text-rose-400" />,
      content: "If you toggle the 'Enable eBPF Adaptive Autoscaling' switch to ON, the backend constantly watches the telemetry. If you inject a 'Memory Leak', the system detects the spike in Page Faults (>5000/s) and automatically scales the Pod UP to handle the load. You can watch exactly why it scales in the 'Live Autoscaler Logs' panel on the right.",
    }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Server className="w-48 h-48" />
      </div>
      
      <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-2">
        <span className="bg-emerald-500/20 text-emerald-400 p-1.5 rounded-lg border border-emerald-500/30">
          <ChevronRight className="w-5 h-5" />
        </span>
        How to use this Demo (Step-by-Step)
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
        {steps.map((s) => (
          <motion.div 
            key={s.id}
            whileHover={{ y: -5 }}
            className={`cursor-pointer rounded-xl p-5 border transition-all duration-300 ${
              step === s.id 
                ? 'bg-slate-800 border-slate-600 shadow-lg' 
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
            }`}
            onClick={() => setStep(s.id)}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                {s.icon}
              </div>
              <div className={`text-xs font-bold px-2 py-1 rounded-full ${
                step === s.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}>
                Step {s.id}
              </div>
            </div>
            <h3 className="font-semibold text-slate-200 mb-2">{s.title}</h3>
            {step === s.id && (
              <motion.p 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-sm text-slate-400 leading-relaxed"
              >
                {s.content}
              </motion.p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
