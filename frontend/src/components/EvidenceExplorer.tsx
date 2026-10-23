import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

export default function EvidenceExplorer() {
  const [selectedView, setSelectedView] = useState<'cdf' | 'llc' | 'overhead'>('cdf');

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

  // Overhead benchmark data from evidence/raw_data/scheduling_overhead_bench.csv
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
      {/* Top Section */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">
              BENCHMARK EVALUATION EVIDENCE · 95% CONFIDENCE INTERVALS
            </div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Empirical Comparative Analysis Across Schedulers
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Measured on a 5-node cluster running adversarial noisy neighbors alongside latency-critical microservices. Baseline configurations evaluated across N = 10 randomized trials.
            </p>
          </div>

          <div className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/60 p-1 rounded">
            <button
              onClick={() => setSelectedView('cdf')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                selectedView === 'cdf'
                  ? 'bg-zinc-100 text-black font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Tail CDF
            </button>
            <button
              onClick={() => setSelectedView('llc')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                selectedView === 'llc'
                  ? 'bg-zinc-100 text-black font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              LLC Miss Rate
            </button>
            <button
              onClick={() => setSelectedView('overhead')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                selectedView === 'overhead'
                  ? 'bg-zinc-100 text-black font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Overhead
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid (Monochrome, Vercel-style) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="text-[11px] font-mono text-zinc-500 uppercase">LLC Miss Rate (Target Web)</div>
          <div className="text-2xl font-mono font-semibold text-zinc-100 mt-2">41.8%</div>
          <div className="text-xs text-zinc-400 mt-1 font-mono">
            -33.0% vs. Default K8s (62.4%)
          </div>
          <div className="text-[10px] text-zinc-600 mt-2 border-t border-zinc-900 pt-2 font-mono">
            CI95: [40.6%, 43.0%]
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="text-[11px] font-mono text-zinc-500 uppercase">p99 Request Tail Latency</div>
          <div className="text-2xl font-mono font-semibold text-zinc-100 mt-2">20.40 ms</div>
          <div className="text-xs text-zinc-400 mt-1 font-mono">
            -67.7% vs. Default K8s (63.10 ms)
          </div>
          <div className="text-[10px] text-zinc-600 mt-2 border-t border-zinc-900 pt-2 font-mono">
            CI95: [20.02, 20.78] ms
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="text-[11px] font-mono text-zinc-500 uppercase">SLO Violations (&gt;15ms)</div>
          <div className="text-2xl font-mono font-semibold text-zinc-100 mt-2">11.32%</div>
          <div className="text-xs text-zinc-400 mt-1 font-mono">
            Default K8s incurs 99.98% breach
          </div>
          <div className="text-[10px] text-zinc-600 mt-2 border-t border-zinc-900 pt-2 font-mono">
            Matches static anti-affinity (14.05%)
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4">
          <div className="text-[11px] font-mono text-zinc-500 uppercase">Hot-Path Scoring Latency</div>
          <div className="text-2xl font-mono font-semibold text-zinc-100 mt-2">0.318 ms</div>
          <div className="text-xs text-zinc-400 mt-1 font-mono">
            93.6% Headroom in 5.0ms Budget
          </div>
          <div className="text-[10px] text-zinc-600 mt-2 border-t border-zinc-900 pt-2 font-mono">
            O(M) scaling up to 100 resident pods
          </div>
        </div>
      </div>

      {/* Main Chart Card */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-6">
        {selectedView === 'cdf' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">
                  Request Latency Cumulative Distribution Function (CDF)
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">
                  X-Axis: Response Time (ms) · Y-Axis: Cumulative Completion (%) · N = 10,000 requests per policy
                </p>
              </div>
              <div className="text-xs font-mono text-zinc-400 border border-zinc-800 px-2 py-1 rounded bg-zinc-900">
                SLO: 15.0 ms
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cdfData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="latency" unit=" ms" stroke="#52525b" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" stroke="#52525b" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: any) => [`${val}%`, '']}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                  <Line type="monotone" dataKey="akil" name="AKIL (Proposed)" stroke="#ffffff" strokeWidth={2.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="antiAffinity" name="Static Anti-Affinity" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="descheduler" name="Reactive Descheduler" stroke="#eab308" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="defaultK8s" name="Default kube-scheduler" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="2 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600 pt-3 border-t border-zinc-900">
              <span>Source: evidence/figures_data/fig2_tail_latency_cdf.dat</span>
              <span>Notice: AKIL matches rigid Anti-Affinity without causing node fragmentation</span>
            </div>
          </div>
        )}

        {selectedView === 'llc' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-zinc-200">
                Last-Level Cache (LLC) Miss Rate Across Workloads
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Hardware Performance Counter PERF_COUNT_HW_CACHE_MISSES Normalized Per Container
              </p>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cacheMissData} margin={{ top: 20, right: 20, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="workload" stroke="#52525b" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" stroke="#52525b" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: any) => [`${val}%`, 'Miss Rate']}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                  <Bar dataKey="defaultK8s" name="Default kube-scheduler" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="akil" name="AKIL Score Plugin" fill="#ffffff" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600 pt-3 border-t border-zinc-900">
              <span>Source: evidence/figures_data/fig1_llc_miss_rates.dat</span>
              <span>AKIL reduces target web microservice LLC miss rate by 33.0%</span>
            </div>
          </div>
        )}

        {selectedView === 'overhead' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-zinc-200">
                Scheduling Score() Execution Time vs Resident Pod Count (M = 1 to 100)
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Demonstrates O(M) scalability against the Kubernetes Scheduling Framework &lt;5.0ms hot-path budget
              </p>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overheadData} margin={{ top: 20, right: 20, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="pods" stroke="#52525b" tick={{ fontSize: 11 }} />
                  <YAxis unit=" ms" stroke="#52525b" domain={[0, 1]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: any) => [`${val} ms`, 'Score Latency']}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                  <Bar dataKey="endToEndMs" name="Measured End-to-End Score Phase Latency (ms)" fill="#ffffff" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600 pt-3 border-t border-zinc-900">
              <span>Source: evidence/raw_data/scheduling_overhead_bench.csv</span>
              <span className="text-zinc-300 font-medium">93.6% Headroom remains within K8s 5.0ms threshold</span>
            </div>
          </div>
        )}
      </div>

      {/* Comprehensive Statistical Significance Table (Matching Table IV of Paper) */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-6">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">
            Comparative Benchmark Matrix Across Baselines (N = 10 Runs, 95% CI)
          </h3>
          <p className="text-xs text-zinc-500 font-mono">
            Exact empirical data matching Table IV in the IEEE conference manuscript.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3 font-sans">Placement Architecture</th>
                <th className="py-2.5 px-3">LLC Miss Rate</th>
                <th className="py-2.5 px-3">p50 Latency</th>
                <th className="py-2.5 px-3">p99 Tail</th>
                <th className="py-2.5 px-3">p99.9 Extreme</th>
                <th className="py-2.5 px-3">SLO Violations</th>
                <th className="py-2.5 px-3">Evictions</th>
                <th className="py-2.5 px-3">Fragmentation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              <tr className="hover:bg-zinc-900/30">
                <td className="py-2.5 px-3 font-sans text-zinc-400">Isolated (Clean Oracle)</td>
                <td className="py-2.5 px-3 text-zinc-400">38.0%</td>
                <td className="py-2.5 px-3 text-zinc-400">9.50 ± 0.04 ms</td>
                <td className="py-2.5 px-3 text-zinc-400">17.51 ± 0.48 ms</td>
                <td className="py-2.5 px-3 text-zinc-400">23.74 ± 1.12 ms</td>
                <td className="py-2.5 px-3 text-zinc-400">3.43%</td>
                <td className="py-2.5 px-3 text-zinc-400">0</td>
                <td className="py-2.5 px-3 text-zinc-400">0%</td>
              </tr>
              <tr className="hover:bg-zinc-900/30">
                <td className="py-2.5 px-3 font-sans text-rose-400">Default kube-scheduler</td>
                <td className="py-2.5 px-3 text-rose-400">62.4%</td>
                <td className="py-2.5 px-3 text-zinc-300">37.87 ± 0.24 ms</td>
                <td className="py-2.5 px-3 text-rose-400 font-semibold">63.10 ± 1.52 ms</td>
                <td className="py-2.5 px-3 text-zinc-300">74.29 ± 2.55 ms</td>
                <td className="py-2.5 px-3 text-rose-400 font-semibold">99.98%</td>
                <td className="py-2.5 px-3 text-zinc-300">0</td>
                <td className="py-2.5 px-3 text-zinc-300">0%</td>
              </tr>
              <tr className="hover:bg-zinc-900/30">
                <td className="py-2.5 px-3 font-sans text-zinc-300">Static Anti-Affinity</td>
                <td className="py-2.5 px-3 text-zinc-300">42.1%</td>
                <td className="py-2.5 px-3 text-zinc-300">11.62 ± 0.09 ms</td>
                <td className="py-2.5 px-3 text-zinc-300">20.88 ± 0.36 ms</td>
                <td className="py-2.5 px-3 text-zinc-300">27.39 ± 1.57 ms</td>
                <td className="py-2.5 px-3 text-zinc-300">14.05%</td>
                <td className="py-2.5 px-3 text-zinc-300">0</td>
                <td className="py-2.5 px-3 text-amber-400">0.4% (Frags under load)</td>
              </tr>
              <tr className="hover:bg-zinc-900/30">
                <td className="py-2.5 px-3 font-sans text-amber-400">Reactive Descheduler</td>
                <td className="py-2.5 px-3 text-zinc-300">54.8%</td>
                <td className="py-2.5 px-3 text-zinc-300">23.76 ± 0.13 ms</td>
                <td className="py-2.5 px-3 text-zinc-300">43.72 ± 1.06 ms</td>
                <td className="py-2.5 px-3 text-zinc-300">54.24 ± 2.16 ms</td>
                <td className="py-2.5 px-3 text-rose-400">94.04%</td>
                <td className="py-2.5 px-3 text-rose-400 font-semibold">92 evictions</td>
                <td className="py-2.5 px-3 text-zinc-300">0%</td>
              </tr>
              <tr className="bg-zinc-900/80 border-l-2 border-zinc-200">
                <td className="py-2.5 px-3 font-sans font-semibold text-zinc-100">AKIL (Proposed)</td>
                <td className="py-2.5 px-3 font-semibold text-zinc-100">41.8%</td>
                <td className="py-2.5 px-3 font-semibold text-zinc-100">11.22 ± 0.06 ms</td>
                <td className="py-2.5 px-3 font-semibold text-zinc-100">20.40 ± 0.38 ms</td>
                <td className="py-2.5 px-3 font-semibold text-zinc-100">26.22 ± 1.58 ms</td>
                <td className="py-2.5 px-3 font-semibold text-zinc-100">11.32%</td>
                <td className="py-2.5 px-3 font-semibold text-zinc-100">0</td>
                <td className="py-2.5 px-3 font-semibold text-zinc-100">0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
