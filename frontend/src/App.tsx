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
      <header className="sticky top-0 z-40 bg-paper border-b border-line">
        <div className="container h-16 flex items-center gap-6">
          <p className="shrink-0 leading-tight">
            <span className="font-medium">AKIL</span>
            <span className="hidden md:inline text-muted text-sm ml-3">Kernel-aware scheduling for Kubernetes</span>
          </p>
          <nav className="ml-auto flex gap-1 overflow-x-auto" aria-label="Chapters">
            {CHAPTERS.map((name, i) => (
              <button key={name} onClick={() => setChapter(i)} aria-current={chapter === i ? 'step' : undefined} className="tab shrink-0">
                <span className="measured mr-2 text-muted">{i + 1}</span>{name}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="container flex-1 py-12">
        {chapter === 0 && <Problem onNext={() => setChapter(1)} />}
        {chapter === 1 && <LiveDemo />}
        {chapter === 2 && <Results />}
        {chapter === 3 && <HowItWorks />}
      </main>

      <footer className="container py-6 text-sm text-muted flex justify-between gap-4 border-t border-line">
        <span>AKIL: Adaptive Kernel Intelligence Layer</span>
        <span className="hidden sm:inline">Left and right arrow keys move between chapters</span>
      </footer>
    </div>
  );
}
