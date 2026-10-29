import type { ReactNode } from 'react';

export type SignalId = 'cache' | 'lock' | 'pageFault' | 'ctxSwitch';

// Plain-English names first; the kernel source is secondary detail.
export const SIGNALS: Record<SignalId, { label: string; plain: string; source: string; color: string; unit: string }> = {
  cache: { label: 'Cache misses', plain: 'Evicts other pods’ data from the shared CPU cache', source: 'perf_event · PERF_COUNT_HW_CACHE_MISSES', color: 'var(--color-cache)', unit: '/s' },
  lock: { label: 'Lock waiting', plain: 'Share of time threads spend stuck waiting on locks', source: 'tracepoint lock:contention_begin/end', color: 'var(--color-lock)', unit: '%' },
  pageFault: { label: 'Page faults', plain: 'How often memory has to be fetched or mapped in', source: 'tracepoint exceptions:page_fault_*', color: 'var(--color-fault)', unit: '/s' },
  ctxSwitch: { label: 'Context switches', plain: 'How often the CPU is yanked between tasks', source: 'tracepoint sched:sched_switch', color: 'var(--color-ctx)', unit: '/s' },
};

export function fmt(n: number, unit: string) {
  if (unit === '%') return `${(n * 100).toFixed(1)}%`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M/s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k/s`;
  return `${Math.round(n)}/s`;
}

// Log-ish scale so calm (hundreds) and noisy (hundreds of thousands) both read.
export function SignalBar({ id, value, max }: { id: SignalId; value: number; max: number }) {
  const s = SIGNALS[id];
  const pct = id === 'lock' ? Math.min(1, value / max) : Math.min(1, Math.log10(1 + value) / Math.log10(1 + max));
  return (
    <div className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-[13px]">
      <span className="text-muted">{s.label}</span>
      <span className="h-2 rounded-full bg-track overflow-hidden">
        <span className="block h-full w-full rounded-full origin-left transition-transform duration-700" style={{ transform: `scaleX(${pct})`, background: s.color }} />
      </span>
      <span className="measured text-right">{fmt(value, s.unit)}</span>
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', disabled }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'quiet' | 'danger'; disabled?: boolean;
}) {
  const style = { primary: 'btn btn--primary', quiet: 'btn', danger: 'btn btn--danger' }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className={style}>
      {children}
    </button>
  );
}
