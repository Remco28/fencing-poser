import { useEffect, useMemo, useRef, useState } from 'react';
import { folderSyncAvailable, FOLDER_FILE, SNAPSHOT_DAYS } from '../library/folder.ts';
import type { LibraryEntry } from '../library/storage.ts';
import { useEditor } from './store.ts';

type Sort = 'recent' | 'name';
/** '' = all, '\u0000' = unfiled, anything else = that collection. */
const UNFILED = '\u0000';

export function LibraryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useEditor();
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [collection, setCollection] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setMessage('');
      setSelected(new Set());
      void s.refreshLibrary();
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, s]);

  const collections = useMemo(
    () => [...new Set(s.library.map((c) => c.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [s.library],
  );

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return s.library
      .filter((c) => !collection || (collection === UNFILED ? !c.collection : c.collection === collection))
      .filter((c) => words.every((w) => c.text.includes(w)))
      .sort((a, b) => (sort === 'name' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [s.library, query, sort, collection]);

  const close = (after?: () => unknown) => {
    void after?.();
    onClose();
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <dialog ref={dialog} className="library wide-dialog" onClose={onClose}>
      <div className="section-head">
        <h2>Library</h2>
        <button className="link" onClick={() => close()}>
          Close
        </button>
      </div>

      <FolderSync onMessage={setMessage} />

      <div className="buttons">
        <button className="primary" onClick={() => close(s.createCombination)}>
          New combination
        </button>
        <button onClick={() => close(s.duplicateCombination)}>Duplicate the open one</button>
        <button onClick={() => file.current?.click()}>Import a file…</button>
        <button onClick={() => void s.exportLibrary()} title="Every combination and every pose, in one file">
          Back up everything
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setMessage(await s.importLibrary(await f.text()));
          }}
        />
      </div>
      {message && <p className="message">{message}</p>}

      <div className="library-filters">
        <input
          type="search"
          className="wide"
          placeholder="Search titles, step labels and notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the library"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="recent">Recently changed</option>
          <option value="name">By name</option>
        </select>
      </div>
      <div className="collection-chips" role="radiogroup" aria-label="Collection">
        {[
          ['', `All (${s.library.length})`],
          ...collections.map((c) => [c, `${c} (${s.library.filter((e) => e.collection === c).length})`]),
          ...(collections.length ? [[UNFILED, `Unfiled (${s.library.filter((e) => !e.collection).length})`]] : []),
        ].map(([value, text]) => (
          <button key={value} role="radio" aria-checked={collection === value} className={collection === value ? 'on' : ''} onClick={() => setCollection(value)}>
            {text}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="selection-bar">
          <span>{selected.size} selected</span>
          <button onClick={() => void s.exportLibrary([...selected])}>Export selected</button>
          <MoveTo
            collections={collections}
            label="Move selected to…"
            onMove={async (to) => {
              for (const id of selected) await s.setCollection(id, to);
              setSelected(new Set());
            }}
          />
          <button className="link" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <ul className="library-list">
        {s.library.length === 0 && <li className="hint">Nothing saved yet. Combinations save as soon as you change them.</li>}
        {s.library.length > 0 && shown.length === 0 && <li className="hint">Nothing matches.</li>}
        {shown.map((c) => (
          <Row
            key={c.id}
            entry={c}
            current={c.id === s.combination.id}
            checked={selected.has(c.id)}
            onCheck={() => toggle(c.id)}
            collections={collections}
            onOpen={() => close(() => s.openCombination(c.id))}
          />
        ))}
      </ul>
    </dialog>
  );
}

function Row(props: {
  entry: LibraryEntry;
  current: boolean;
  checked: boolean;
  onCheck: () => void;
  collections: string[];
  onOpen: () => void;
}) {
  const s = useEditor();
  const [confirming, setConfirming] = useState(false);
  const c = props.entry;
  return (
    <li className={props.current ? 'current' : ''}>
      <input type="checkbox" checked={props.checked} onChange={props.onCheck} aria-label={`Select ${c.title}`} />
      <button className="open" onClick={props.onOpen}>
        <strong>
          {c.title || 'Untitled'}
          {c.collection && <span className="badge">{c.collection}</span>}
        </strong>
        <span className="labels">{c.labels.length ? c.labels.join(' → ') : 'No step labels yet'}</span>
        <span>
          {c.steps} step{c.steps === 1 ? '' : 's'} · changed {new Date(c.updatedAt).toLocaleString()}
        </span>
      </button>
      <MoveTo collections={props.collections} label="Move to…" current={c.collection} onMove={(to) => s.setCollection(c.id, to)} />
      {confirming ? (
        <>
          <button className="danger-solid" onClick={() => void s.removeCombination(c.id)}>
            Delete for good
          </button>
          <button className="quiet" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </>
      ) : (
        <button className="quiet" onClick={() => setConfirming(true)}>
          Delete
        </button>
      )}
    </li>
  );
}

/** Pick an existing collection or type a new one. */
function MoveTo(props: { collections: string[]; label: string; current?: string; onMove: (to: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const listId = useMemo(() => `collections-${Math.random().toString(36).slice(2)}`, []);
  if (!editing) {
    return (
      <button
        className="quiet"
        onClick={() => {
          setValue(props.current ?? '');
          setEditing(true);
        }}
      >
        {props.label}
      </button>
    );
  }
  const done = async () => {
    await props.onMove(value);
    setEditing(false);
  };
  return (
    <form
      className="move-to"
      onSubmit={(e) => {
        e.preventDefault();
        void done();
      }}
    >
      <input
        autoFocus
        list={listId}
        placeholder="Collection (empty = unfiled)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
      />
      <datalist id={listId}>
        {props.collections.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <button type="submit" className="primary">
        Move
      </button>
    </form>
  );
}

function FolderSync({ onMessage }: { onMessage: (message: string) => void }) {
  const s = useEditor();
  if (!folderSyncAvailable()) {
    return (
      <p className="hint">
        Everything is saved in this browser. Use <strong>Back up everything</strong> now and then: clearing browser data
        would erase it. (Chrome or Edge can also keep a copy in a folder; in Brave, turn on{' '}
        <code>brave://flags/#file-system-access-api</code>.)
      </p>
    );
  }
  return (
    <div className="folder">
      {!s.folder && (
        <>
          <span className="hint">
            Saved in this browser only. Keep a copy in a folder too: it is updated as you work, with a backup per day for{' '}
            {SNAPSHOT_DAYS} days.
          </span>
          <button onClick={async () => onMessage(await s.connectFolder())}>Save to a folder…</button>
        </>
      )}
      {s.folder?.ready && (
        <>
          <span>
            ✓ Also saving to the folder <strong>{s.folder.name}</strong> (<code>{FOLDER_FILE}</code>, with daily backups in{' '}
            <code>backups/</code>)
          </span>
          <button className="quiet" onClick={() => void s.disconnectFolder()}>
            Stop
          </button>
        </>
      )}
      {s.folder && !s.folder.ready && (
        <>
          <button onClick={async () => onMessage(await s.reconnectFolder())}>Reconnect “{s.folder.name}”</button>
          <span className="hint">The browser needs your OK to use the folder again.</span>
          <button className="quiet" onClick={() => void s.disconnectFolder()}>
            Forget it
          </button>
        </>
      )}
    </div>
  );
}
