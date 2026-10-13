import { useEffect, useRef } from 'react';
import { useEditor } from './store.ts';

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Every edit since the combination was opened, oldest first, as in a photo
 * editor's history: click one to go back to just after it. Edits after it
 * stay listed (greyed) until something new is done, so a jump can be undone
 * by clicking further down.
 */
export function HistoryList() {
  const s = useEditor();
  const list = useRef<HTMLOListElement>(null);
  const entries = [...s.past.map((p) => p.change), s.change, ...s.future.map((p) => p.change)];
  const now = s.past.length;

  useEffect(() => {
    list.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
  }, [now, entries.length]);

  return (
    <section className="history" aria-label="History">
      <ol ref={list}>
        {entries.map((c, i) => (
          <li key={i}>
            <button
              className={i > now ? 'undone' : ''}
              aria-current={i === now ? 'step' : undefined}
              onClick={() => s.jumpTo(i)}
              title={i === now ? 'Where you are now' : i < now ? 'Go back to just after this' : 'Redo up to here'}
            >
              <span className="what">{c.label}</span>
              <span className="when">{time(c.at)}</span>
            </button>
          </li>
        ))}
      </ol>
      {s.past.length + s.future.length >= 200 && <p className="hint">Keeps the last 200 edits.</p>}
    </section>
  );
}
