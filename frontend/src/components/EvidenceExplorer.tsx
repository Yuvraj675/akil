import { useState } from 'react';
import { BarChart3, TrendingDown, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

export default function EvidenceExplorer() {
  const [selectedMetric, setSelectedMetric] = useState<'latency' | 'cache' | 'slo'>('latency');

  // Empirical data from evidence/figures_data/fig2_tail_latency_cdf.dat
  const cdfData = [
    { latency: 1, defaultK8s: 1.0, antiAffinity: 1.0, descheduler: 1.0, akil: 1.0 },
    { latency: 4, defaultK8s: 1.0, antiAffinity: 1.0, descheduler: 1.0, akil: 1.0 },
    { latency: 6, defaultK8s: 1.0, antiAffinity: 25.8, descheduler: 1.0, akil: 26.7 },
    { latency: 8, defaultK8s: 1.0, antiAffinity: 34.4, descheduler: 1.0, akil: 35.6 },
    { latency: 10, defaultK8s: 1.0, antiAffinity: 43.0, descheduler: 1.0, akil: 44.5 },
    { latency: 12, defaultK8s: 1.0, antiAffinity: 52.0, descheduler: 25.2, akil: 54.1 },
    { latency: 15, defaultK8s: 1.0, antiAffinity: 67.9, descheduler: 31.6, akil: 70.2 },
    { latency: 20, defaultK8s: 26.4, antiAffinity: 94.3, descheduler: 42.1, akil: 96.9 },
    { latency: 25, defaultK8s: 33.0, antiAffinity: 99.1, descheduler: 53.0, akil: 99.2 },
    { latency: 30, defaultK8s: 39.6, antiAffinity: 99.3, descheduler: 65.3, akil: 99.3 },
    { latency: 40, defaultK8s: 54.1, antiAffinity: 99.6, descheduler: 89.9, akil: 99.6 },
    { latency: 50, defaultK8s: 73.6, antiAffinity: 99.9, descheduler: 99.1, akil: 100.0 },
    { latency: 60, defaultK8s: 93.0, antiAffinity: 100.0, descheduler: 99.3, akil: 100.0 },
    { latency: 80, defaultK8s: 99.2, antiAffinity: 100.0, descheduler: 99.6, akil: 100.0 },
    { latency: 100, defaultK8s: 99.4, antiAffinity: 100.0, descheduler: 99.9, akil: 100.0 },
  ];

  // Empirical data from evidence/figures_data/fig1_llc_miss_rates.dat
  const cacheMissData = [
    { workload: 'cache-stress', defaultK8s: 85.0, akil: 84.0 },
    { workload: 'lock-stress', defaultK8s: 48.0, akil: 44.0 },
    { workload: 'baseline-web (Target)', defaultK8s: 62.4, akil: 41.8 },
  ];

  // Overhead benchmark data
  const overheadData = [
    { pods: '1 pod', pureMathUs: 0.44, endToEndMs: 0.310 },
    { pods: '5 pods', pureMathUs: 2.93, endToEndMs: 0.310 },
    { pods: '10 pods', pureMathUs: 3.02, endToEndMs: 0.310 },
    { pods: '20 pods', pureMathUs: 6.37, endToEndMs: 0.311 },
    { pods: '50 pods', pureMathUs: 16.79, endToEndMs: 0.313 },
    { pods: '100 pods', pureMathUs: 54.52, endToEndMs: 0.318 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-indigo-500/20 text-indigo-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-indigo-500/30 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> IEEE Conference Evaluation Dataset
              </span>
              <span className="text-slate-400 text-xs">N = 10 Trials | 95% Confidence Intervals</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-100">
              Comparative Benchmark Evidence
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Rigorous experimental results evaluating AKIL against the standard Kubernetes scheduler, static anti-affinity label rules, and reactive descheduling under identical 5-node cluster load.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setSelectedMetric('latency')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedMetric === 'latency'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tail Latency CDF
            </button>
            <button
              onClick={() => setSelectedMetric('cache')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedMetric === 'cache'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              LLC Miss Rate
            </button>
            <button
              onClick={() => setSelectedMetric('slo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedMetric === 'slo'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scheduling Overhead
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>LLC Cache Miss Rate</span>
            <TrendingDown className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">41.8%</div>
          <p className="text-xs text-emerald-400 mt-1 font-medium">-33.0% vs. Default K8s (62.4%)</p>
          <div className="text-[11px] text-slate-500 mt-2">Target web microservice under stress</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>p99 Tail Latency</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">20.40 ms</div>
          <p className="text-xs text-emerald-400 mt-1 font-medium">-67.7% vs. Default K8s (63.1 ms)</p>
          <div className="text-[11px] text-slate-500 mt-2">95% CI: [20.02, 20.78] ms</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>SLO Violations (&gt;15ms)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">11.32%</div>
          <p className="text-xs text-emerald-400 mt-1 font-medium">-88.7% reduction vs Default</p>
          <div className="text-[11px] text-slate-500 mt-2">Default K8s incurs 99.98% breach</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>Score Phase Overhead</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">0.318 ms</div>
          <p className="text-xs text-cyan-400 mt-1 font-medium">93.6% Headroom in 5ms Budget</p>
          <div className="text-[11px] text-slate-500 mt-2">Even with 100 co-located pods</div>
        </div>
      </div>

      {/* Chart Visualization Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
        {selectedMetric === 'latency' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Request Latency Cumulative Distribution Function (CDF)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Percentage of requests completed within target latency threshold (ms). Steeper curves towards the left indicate superior QoS.
                </p>
              </div>
              <div className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700">
                SLO Deadline: <span className="font-semibold text-rose-400">15.0 ms</span>
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cdfData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="latency" unit=" ms" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis unit="%" stroke="#64748b" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    formatter={(val: any) => [`${val}% of requests`, '']}
                    labelFormatter={(label) => `Response Time ≤ ${label} ms`}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="akil" name="AKIL (Proposed Closed-Loop)" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="antiAffinity" name="Static Anti-Affinity (SRE Baseline)" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="descheduler" name="Reactive Descheduler" stroke="#fbbf24" strokeWidth={2} />
                  <Line type="monotone" dataKey="defaultK8s" name="Default kube-scheduler" stroke="#f43f5e" strokeWidth={2} strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
              <span>Source: evidence/figures_data/fig2_tail_latency_cdf.dat</span>
              <span>Notice: AKIL matches rigid Anti-Affinity without node capacity fragmentation</span>
            </div>
          </div>
        )}

        {selectedMetric === 'cache' && (
          <div>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-100">
                Last-Level Cache (LLC) Miss Rate Under Adversarial Co-location
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Hardware performance counter measurements (PERF_COUNT_HW_CACHE_MISSES) normalized per workload.
              </p>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cacheMissData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="workload" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis unit="%" stroke="#64748b" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    formatter={(val: any) => [`${val}% miss rate`, '']}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="defaultK8s" name="Default kube-scheduler" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="akil" name="AKIL Score Plugin" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
              <span>Source: evidence/figures_data/fig1_llc_miss_rates.dat</span>
              <span>AKIL reduces target web microservice LLC miss rate by 33.0% by steering away from cache thrashers</span>
            </div>
          </div>
        )}

        {selectedMetric === 'slo' && (
          <div>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-100">
                Scheduler Score() Latency Budget Compliance ($&lt; 5.0$ ms)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Latency of scoring computation as resident containers scale from 1 to 100 pods per physical node.
              </p>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overheadData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="pods" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis unit=" ms" stroke="#64748b" domain={[0, 5]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    formatter={(val: any) => [`${val} ms`, 'Score Latency']}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="endToEndMs" name="Measured End-to-End Score Phase Latency (ms)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
              <span>Source: evidence/raw_data/scheduling_overhead_bench.csv</span>
              <span className="text-emerald-400 font-medium">93.6% Headroom remains within K8s 5.0ms threshold</span>
            </div>
          </div>
        )}
      </div>

      {/* Comprehensive Statistical Significance Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md overflow-hidden">
        <h3 className="text-base font-semibold text-slate-100 mb-1">
          Full Comparative Matrix Across Baselines (N = 10 Runs, 95% CI)
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Exact statistical data matching Table IV in the IEEE conference manuscript.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Placement Architecture</th>
                <th className="py-3 px-4">LLC Miss Rate</th>
                <th className="py-3 px-4">p50 Latency</th>
                <th className="py-3 px-4">p99 Tail Latency</th>
                <th className="py-3 px-4">p99.9 Extreme</th>
                <th className="py-3 px-4">SLO Violations</th>
                <th className="py-3 px-4">Pod Restarts</th>
                <th className="py-3 px-4">Capacity Waste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-4 font-sans font-medium text-slate-400">Isolated (Clean Oracle)</td>
                <td className="py-3.5 px-4">38.0%</td>
                <td className="py-3.5 px-4">9.50 ± 0.04 ms</td>
                <td className="py-3.5 px-4">17.51 ± 0.48 ms</td>
                <td className="py-3.5 px-4">23.74 ± 1.12 ms</td>
                <td className="py-3.5 px-4 text-emerald-400">3.43%</td>
                <td className="py-3.5 px-4">0</td>
                <td className="py-3.5 px-4">0%</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-4 font-sans font-medium text-rose-400">Default kube-scheduler</td>
                <td className="py-3.5 px-4 text-rose-400">62.4%</td>
                <td className="py-3.5 px-4">37.87 ± 0.24 ms</td>
                <td className="py-3.5 px-4 text-rose-400 font-bold">63.10 ± 1.52 ms</td>
                <td className="py-3.5 px-4">74.29 ± 2.55 ms</td>
                <td className="py-3.5 px-4 text-rose-400 font-bold">99.98%</td>
                <td className="py-3.5 px-4">0</td>
                <td className="py-3.5 px-4">0%</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-4 font-sans font-medium text-sky-400">Static Anti-Affinity</td>
                <td className="py-3.5 px-4">42.1%</td>
                <td className="py-3.5 px-4">11.62 ± 0.09 ms</td>
                <td className="py-3.5 px-4">20.88 ± 0.36 ms</td>
                <td className="py-3.5 px-4">27.39 ± 1.57 ms</td>
                <td className="py-3.5 px-4">14.05%</td>
                <td className="py-3.5 px-4">0</td>
                <td className="py-3.5 px-4 text-amber-400 font-bold">0.4% (Frags under load)</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3.5 px-4 font-sans font-medium text-amber-400">Reactive Descheduler</td>
                <td className="py-3.5 px-4">54.8%</td>
                <td className="py-3.5 px-4">23.76 ± 0.13 ms</td>
                <td className="py-3.5 px-4">43.72 ± 1.06 ms</td>
                <td className="py-3.5 px-4">54.24 ± 2.16 ms</td>
                <td className="py-3.5 px-4">94.04%</td>
                <td className="py-3.5 px-4 text-rose-400 font-bold">92 evictions (Churn)</td>
                <td className="py-3.5 px-4">0%</td>
              </tr>
              <tr className="bg-emerald-950/20 hover:bg-emerald-950/30 border-l-2 border-emerald-500">
                <td className="py-3.5 px-4 font-sans font-bold text-emerald-400">AKIL (Proposed)</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400">41.8%</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400">11.22 ± 0.06 ms</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400">20.40 ± 0.38 ms</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400">26.22 ± 1.58 ms</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400">11.32%</td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">0 (Zero churn)</td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">0% (Zero waste)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
