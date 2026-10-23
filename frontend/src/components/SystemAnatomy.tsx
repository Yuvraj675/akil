import { useState } from 'react';
import { ArrowRight, Shield, Zap, Terminal } from 'lucide-react';

interface AnatomyLayer {
  id: string;
  number: string;
  name: string;
  subsystem: string;
  scope: string;
  latencyTarget: string;
  details: string;
  components: { name: string; type: string; desc: string }[];
  codeSnippet: string;
}

const LAYERS: AnatomyLayer[] = [
  {
    id: 'layer-1',
    number: '01',
    name: 'Kernel Probes & Performance Counters',
    subsystem: 'Linux Kernel Space (eBPF / CO-RE)',
    scope: 'Host Kernel per Node',
    latencyTarget: '< 1.0 µs per probe',
    details: 'Runs sandboxed eBPF bytecode attached directly to hardware performance counters and kernel tracepoints. Captures microarchitectural events at the cgroup level before user-space scheduling visibility.',
    components: [
      { name: 'perf_event', type: 'Hardware Counter', desc: 'Samples PERF_COUNT_HW_CACHE_MISSES (1 per 10,000 misses)' },
      { name: 'contention_begin/end', type: 'Kernel Tracepoint', desc: 'Measures futex/mutex wait duration in BPF hash map' },
      { name: 'page_fault_user/kernel', type: 'Kernel Tracepoint', desc: 'Tracks major/minor page faults per cgroup' },
      { name: 'sched_switch', type: 'Scheduler Tracepoint', desc: 'Captures voluntary/involuntary context switches' },
      { name: 'bpf_ringbuf', type: 'Shared Memory Map', desc: 'Single 16 MB ring buffer for lock-free event streaming' }
    ],
    codeSnippet: `struct event_t {
  __u8  event_type;    /* 1=PF, 2=CM, 3=LOCK, 4=CTX */
  __u64 cgroup_id;     /* Kernel cgroup v2 ID */
  __u64 timestamp_ns;  /* Nanosecond monotonic */
  union {
    struct { __u64 address; } page_fault;
    struct { __u64 duration_ns; } lock_contention;
    struct { __u64 prev_cgid, next_cgid; } ctx_switch;
  };
};`
  },
  {
    id: 'layer-2',
    number: '02',
    name: 'Telemetry Collector Daemon',
    subsystem: 'User Space DaemonSet (Go)',
    scope: '1 Pod per Physical Node',
    latencyTarget: '< 10 ms event-to-gRPC (p99)',
    details: 'Pure Go DaemonSet utilizing cilium/ebpf. Drains the BPF ring buffer via epoll, maps kernel cgroup IDs to Kubernetes pod metadata via cgroupfs and the local Kubelet API, and streams batches over gRPC.',
    components: [
      { name: 'RingBufferReader', type: 'epoll Loop', desc: 'Non-blocking event stream reader with zero CGo overhead' },
      { name: 'CgroupResolver', type: 'LRU Cache (30s TTL)', desc: 'Resolves cgroup ID -> PodIdentity (namespace, pod, workload_key)' },
      { name: 'BatchAssembler', type: 'Adaptive Buffer', desc: 'Flushes batches every 1,000 events or 1.0 second' },
      { name: 'BackpressureHandler', type: 'Drop-on-Congestion', desc: 'Continuous observation model; drops events if gRPC is saturated' }
    ],
    codeSnippet: `type PodIdentity struct {
  Namespace   string  // "default"
  PodName     string  // "web-frontend-5d4b-x2k4j"
  Container   string  // "nginx"
  WorkloadKey string  // "default/Deployment/web-frontend"
  NodeName    string  // "worker-node-01"
}`
  },
  {
    id: 'layer-3',
    number: '03',
    name: 'Sliding-Window Aggregator',
    subsystem: 'Control Plane Service (Deployment)',
    scope: 'Cluster-wide Centralized In-Memory Store',
    latencyTarget: '< 500 µs query response (p99)',
    details: 'Maintains per-workload runtime profiles across a 60-second circular sliding window (12 buckets x 5s). Eliminates external databases from the hot path to guarantee sub-millisecond query replies.',
    components: [
      { name: 'StreamTelemetry RPC', type: 'gRPC Streaming Ingest', desc: 'Handles simultaneous telemetry feeds from all node collectors' },
      { name: 'CircularBuckets', type: 'sync.RWMutex Buffer', desc: '12 buckets of 5s each; lazy rotation with O(1) writes and O(B) reads' },
      { name: 'ProfileConfidence', type: 'Statistical Classifier', desc: 'Assigns Low (<100), Medium (100-1000), High (>1000) sample weights' },
      { name: 'QueryNodeProfiles', type: 'gRPC Unary Endpoint', desc: 'Returns all resident profiles for a target node within 320 µs' }
    ],
    codeSnippet: `// 60-second sliding window rate computation
cache_miss_rate       = sum(buckets.cache_misses) / 60.0;
page_fault_rate       = sum(buckets.page_faults) / 60.0;
context_switch_rate   = sum(buckets.ctx_switches) / 60.0;
lock_contention_ratio = sum(buckets.lock_ns) / (60.0 * 1e9);`
  },
  {
    id: 'layer-4',
    number: '04',
    name: 'Kubernetes Scheduler Plugin',
    subsystem: 'kube-scheduler Extension (Score Point)',
    scope: 'Scheduling Framework Process',
    latencyTarget: '< 5.0 ms Score() budget (p99)',
    details: 'Evaluates candidate nodes at the standard Score extension point. Calculates microarchitectural interference penalties against resident workloads and graceful-degrades to neutral scores on failures.',
    components: [
      { name: 'Score() Extension', type: 'Scheduling Plugin API', desc: 'Evaluates Score(pod, nodeName) returning an integer in [0, 100]' },
      { name: 'PairwiseInterference', type: 'Co-Location Penalty', desc: 'Calculates min(m_c, m_i) for cache thrashing + sum of contention' },
      { name: 'ConfidenceDampener', type: 'Weight Multiplier', desc: 'Scales penalties by 0.25x for Low, 0.75x for Medium, 1.0x for High' },
      { name: 'GracefulDegradation', type: 'Fail-Open Safe', desc: 'Returns Neutral Score (50) if aggregator query times out (>5ms)' }
    ],
    codeSnippet: `// AKIL Node Scoring Formulation
Score(c, n) = max(0, 100 - sum_i(
  w_cache · (min(m_c, m_i) / R_cache) +
  w_lock  · (l_c + l_i) +
  w_pf    · ((f_c + f_i) / R_pf) +
  w_ctx   · ((s_c + s_i) / R_ctx)
));`
  }
];

export default function SystemAnatomy() {
  const [selectedLayerId, setSelectedLayerId] = useState<string>('layer-1');
  const activeLayer = LAYERS.find(l => l.id === selectedLayerId) || LAYERS[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">
              SYSTEM ARCHITECTURE SPECIFICATION
            </div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Anatomy of the Closed-Loop Pipeline
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Deconstruction of AKIL across the Linux kernel, node-level user space, centralized sliding-window aggregation, and the Kubernetes Scheduling Framework.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 rounded">
              <Shield className="w-3.5 h-3.5 text-zinc-300" /> Kernel: 5.8+ CO-RE
            </span>
            <span className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 rounded">
              <Zap className="w-3.5 h-3.5 text-zinc-300" /> K8s: v1.29+ Framework
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Anatomy Graphic: Horizontal Flow */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-6">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">
          INTERACTIVE ARCHITECTURAL DIAGRAM · SELECT A LAYER TO INSPECT
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
          {LAYERS.map((layer) => {
            const isSelected = selectedLayerId === layer.id;
            return (
              <button
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`text-left p-4 rounded border transition-all relative ${
                  isSelected
                    ? 'border-zinc-300 bg-zinc-900/90 text-zinc-100 shadow-sm'
                    : 'border-zinc-800/80 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    isSelected ? 'border-zinc-500 bg-zinc-800 text-zinc-200' : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                  }`}>
                    LAYER {layer.number}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {layer.latencyTarget}
                  </span>
                </div>

                <div className="text-xs font-semibold text-zinc-200 line-clamp-1 mb-1">
                  {layer.name}
                </div>
                <div className="text-[11px] text-zinc-500 line-clamp-1 font-mono">
                  {layer.subsystem}
                </div>

                {isSelected && (
                  <div className="w-full h-0.5 bg-zinc-200 absolute bottom-0 left-0 rounded-b"></div>
                )}
              </button>
            );
          })}
        </div>

        {/* Connection pipeline hint */}
        <div className="hidden md:flex items-center justify-between text-[11px] font-mono text-zinc-600 px-4 mt-3">
          <span>perf_event / tracepoint</span>
          <ArrowRight className="w-3.5 h-3.5" />
          <span>16MB BPF RingBuf</span>
          <ArrowRight className="w-3.5 h-3.5" />
          <span>gRPC Streaming</span>
          <ArrowRight className="w-3.5 h-3.5" />
          <span>Score() &lt;5ms</span>
        </div>
      </div>

      {/* Layer Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Component Breakdown (7 cols) */}
        <div className="lg:col-span-7 border border-zinc-800 bg-zinc-950 rounded-lg p-6 space-y-5">
          <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
            <div>
              <div className="text-[11px] font-mono text-zinc-500">
                LAYER {activeLayer.number} DETAILS · {activeLayer.scope}
              </div>
              <h3 className="text-base font-semibold text-zinc-100 mt-0.5">
                {activeLayer.name}
              </h3>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono text-zinc-500 uppercase">Latency Budget</div>
              <div className="text-xs font-mono font-medium text-zinc-300">{activeLayer.latencyTarget}</div>
            </div>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            {activeLayer.details}
          </p>

          <div>
            <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2.5">
              Constituent Components &amp; Mechanisms
            </div>
            <div className="space-y-2">
              {activeLayer.components.map((comp, idx) => (
                <div key={idx} className="border border-zinc-800/80 bg-zinc-900/40 rounded p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-semibold text-zinc-200">{comp.name}</span>
                    <span className="text-[10px] font-mono text-zinc-400 border border-zinc-800 px-1.5 py-0.5 rounded bg-zinc-950">
                      {comp.type}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-normal">
                    {comp.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Code & BTF Structure (5 cols) */}
        <div className="lg:col-span-5 border border-zinc-800 bg-zinc-950 rounded-lg p-6 space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <span className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" /> Kernel / Runtime Definition
            </span>
            <span className="text-[10px] font-mono text-zinc-500">Read-Only</span>
          </div>

          <pre className="flex-1 bg-surface-code p-4 rounded border border-zinc-800 text-[11px] font-mono text-zinc-300 leading-relaxed overflow-x-auto whitespace-pre selection:bg-zinc-800">
            {activeLayer.codeSnippet}
          </pre>

          <div className="border border-zinc-800/60 bg-zinc-900/30 p-3 rounded text-[11px] text-zinc-400 leading-relaxed font-mono">
            All eBPF code compiled via <code className="text-zinc-200">bpf2go</code> with BTF relocations. Zero runtime kernel-header compilation required.
          </div>
        </div>
      </div>
    </div>
  );
}
