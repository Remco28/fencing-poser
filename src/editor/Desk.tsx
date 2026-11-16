import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { Combination } from '../model/combination.ts';
import { loadCombination, type LibraryEntry } from '../library/storage.ts';
import { Icon } from '../ui/Icon.tsx';
import { keySteps } from '../viewer/player.ts';
import { useEditor } from './store.ts';
import { useThumbnail } from './thumbs.tsx';
import { useUi } from './ui.ts';

/** '' = all, '\u0000' = unfiled, anything else = that collection. */
const UNFILED = '\u0000';

function when(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return then.toLocaleDateString([], { day: 'numeric', month: 'short', ...(days > 300 ? { year: 'numeric' } : {}) });
}

/**
 * The opening view: the figures on the desk, and beside them the coach's
 * combinations. Pick one (or the figures themselves) and the view moves in
 * to work on it. Keeping the library in order (folders, backups, deleting)
 * is one step further away, under Manage.
 */
export function Desk({ clear, onManage }: { clear: RefObject<HTMLDivElement | null>; onManage: () => void }) {
  const s = useEditor();
  const leave = useUi((u) => u.leaveDesk);
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState('');

  const collections = useMemo(
    () => [...new Set(s.library.map((c) => c.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [s.library],
  );
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return s.library
      .filter((c) => !collection || (collection === UNFILED ? !c.collection : c.collection === collection))
      .filter((c) => words.every((w) => c.text.includes(w)));
  }, [s.library, query, collection]);

  const open = async (id: string) => {
    if (id !== s.combination.id) await s.openCombination(id);
    leave();
  };
  const fresh = () => {
    s.createCombination();
    leave();
  };
  const none = s.loaded && s.library.length === 0;

  return (
    <div className="desk">
      <section className="desk-sheet card" aria-label="Your combinations">
        <h1>Fencing Poser</h1>
        <p className="lead">Set the figures, plot the phrase, hand it to your students.</p>
        <div className="buttons">
          <button className="primary big" onClick={fresh}>
            <Icon name="plus" /> New combination
          </button>
          {none && (
            <button className="big" onClick={leave}>
              Look around first
            </button>
          )}
        </div>

        {!none && (
          <>
            <label className="search">
              <Icon name="search" />
              <input
                type="search"
                placeholder={`Search ${s.library.length} combination${s.library.length === 1 ? '' : 's'}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search your combinations"
              />
            </label>
            {collections.length > 0 && (
              <div className="collection-chips" role="radiogroup" aria-label="Collection">
                {[['', 'All'], ...collections.map((c) => [c, c]), [UNFILED, 'Unfiled']].map(([value, text]) => (
                  <button key={value} role="radio" aria-checked={collection === value} className={`small${collection === value ? ' on' : ''}`} onClick={() => setCollection(value)}>
                    {text}
                  </button>
                ))}
              </div>
            )}
            <ul className="desk-list">
              {shown.map((c) => (
                <Row key={c.id} entry={c} current={c.id === s.combination.id} live={c.id === s.combination.id ? s.combination : null} onOpen={() => void open(c.id)} />
              ))}
              {shown.length === 0 && <li className="hint">Nothing matches.</li>}
            </ul>
          </>
        )}
        {none && (
          <p className="hint first">
            Nothing here yet. A combination is a short phrase of fencing, step by step: you pose two wooden figures, and your students
            watch it on their phones. It saves as you work.
          </p>
        )}

        <footer className="desk-foot">
          <Icon name="folder" />
          <span>
            {s.folder?.ready ? (
              <>Saved here and in “{s.folder.name}”</>
            ) : s.folder ? (
              <>Folder “{s.folder.name}” needs reconnecting</>
            ) : (
              <>Saved in this browser</>
            )}
          </span>
          <button className="link" onClick={onManage} title="Folders and backups, importing, moving and deleting combinations">
            Manage
          </button>
        </footer>
      </section>
      <div className="clear" ref={clear} />
    </div>
  );
}

function Row({ entry: c, current, live, onOpen }: { entry: LibraryEntry; current: boolean; live: Combination | null; onOpen: () => void }) {
  // The picture is of the last step: where the phrase ends is what tells combinations apart.
  const [saved, setSaved] = useState<Combination | null>(null);
  useEffect(() => {
    let alive = true;
    if (!live) void loadCombination(c.id).then((full) => alive && setSaved(full));
    return () => {
      alive = false;
    };
  }, [c.id, c.updatedAt, live]);
  const full = live ?? saved;
  const end = full ? full.steps[keySteps(full).at(-1) ?? 0] : null;
  const picture = useThumbnail(full?.fencers ?? null, end?.poses ?? null);
  return (
    <li>
      <button className={`combo${current ? ' on' : ''}`} onClick={onOpen} title={c.labels.length ? c.labels.join(' → ') : undefined}>
        <span className="pic">{picture && <img src={picture} alt="" draggable={false} />}</span>
        <span className="text">
          <strong>{c.title || 'Untitled'}</strong>
          <span>
            {c.steps} step{c.steps === 1 ? '' : 's'} · {when(c.updatedAt)}
            {c.collection ? ` · ${c.collection}` : ''}
            {current ? ' · open' : ''}
          </span>
        </span>
      </button>
    </li>
  );
}
