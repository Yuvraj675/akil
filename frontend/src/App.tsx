import { useEffect, useState } from 'react';
import Problem from './chapters/Problem';
import LiveDemo from './chapters/LiveDemo';
import Results from './chapters/Results';
import HowItWorks from './chapters/HowItWorks';

const CHAPTERS = ['The problem', 'Live demo', 'Results', 'How it works'] as const;

export default function App() {
  const [chapter, setChapter] = useState(() => {
    const n = Number(new URLSearchParams(location.search).get('c'));
    return n >= 0 && n < CHAPTERS.length ? n : 0;
  });

  useEffect(() => {
    history.replaceState(null, '', `?c=${chapter}`);
    window.scrollTo({ top: 0 });
  }, [chapter]);

  // Arrow keys move between chapters, handy with a presentation clicker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setChapter((c) => Math.min(c + 1, CHAPTERS.length - 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setChapter((c) => Math.max(c - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 flex items-center gap-6">
          <p className="shrink-0 leading-tight">
            <span className="font-semibold">AKIL</span>
            <span className="hidden sm:inline text-muted text-sm ml-2">Kernel-aware scheduling for Kubernetes</span>
          </p>
          <nav className="ml-auto flex gap-1 overflow-x-auto" aria-label="Chapters">
            {CHAPTERS.map((name, i) => (
              <button key={name} onClick={() => setChapter(i)} aria-current={chapter === i ? 'step' : undefined}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${chapter === i ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
                <span className="tabular mr-1.5 opacity-60">{i + 1}</span>{name}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-8 py-10">
        {chapter === 0 && <Problem onNext={() => setChapter(1)} />}
        {chapter === 1 && <LiveDemo />}
        {chapter === 2 && <Results />}
        {chapter === 3 && <HowItWorks />}
      </main>

      <footer className="max-w-[1400px] w-full mx-auto px-4 sm:px-8 py-6 text-sm text-muted flex justify-between gap-4">
        <span>AKIL: Adaptive Kernel Intelligence Layer</span>
        <span className="hidden sm:inline">← → to move between chapters</span>
      </footer>
    </div>
  );
}
