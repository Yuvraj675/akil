import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Terminal, Server, BarChart3, Database } from 'lucide-react';

export default function Walkthrough() {
  const [step, setStep] = useState(1);

  const steps = [
    {
      id: 1,
      title: "1. The Single Docker Node (Kind)",
      icon: <Terminal className="w-5 h-5 text-emerald-400" />,
      content: "You might have noticed only one Docker container running (`akil-demo-control-plane`). This is because we are using Kind (Kubernetes in Docker). Kind runs a full Kubernetes cluster inside a single Docker container. All your scaling (Pods) happens natively inside this Kubernetes environment, handled by containerd.",
    },
    {
      id: 2,
      title: "2. The eBPF Collector",
      icon: <Database className="w-5 h-5 text-blue-400" />,
      content: "Deep inside this node's Linux kernel, the AKIL Collector attaches eBPF probes to kernel tracepoints. It silently monitors low-level events like Page Faults and Context Switches. Because it's at the kernel level, it requires zero changes to your application code.",
    },
    {
      id: 3,
      title: "3. The Aggregator & Scale",
      icon: <Server className="w-5 h-5 text-purple-400" />,
      content: "The eBPF collector streams these raw kernel events to the Aggregator (Control Plane), which maps the raw Cgroup IDs to actual Kubernetes Pod names (like `demo-workload`). When you scale the pods below, watch how the real kernel telemetry instantly spikes on the graphs due to 'noisy neighbor' interference.",
    },
    {
      id: 4,
      title: "4. The Scheduler",
      icon: <BarChart3 className="w-5 h-5 text-rose-400" />,
      content: "AKIL uses this live telemetry to make smarter scheduling decisions. If a node is experiencing high Page Faults or Context Switches (as seen below when scaled to 4 pods), the Scheduler will penalize that node and place future pods elsewhere, ensuring optimal performance.",
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
        How this works (Step-by-Step)
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
