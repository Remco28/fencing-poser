import { useEffect, useRef, useState } from 'react';
import { useEditor } from './store.ts';

export function LibraryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useEditor();
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setMessage('');
      void s.refreshLibrary();
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, s]);

  const close = (after?: () => unknown) => {
    void after?.();
    onClose();
  };

  return (
    <dialog ref={dialog} className="library" onClose={onClose}>
      <div className="section-head">
        <h2>Library</h2>
        <button className="link" onClick={() => close()}>
          Close
        </button>
      </div>
      <p className="hint">
        Everything is saved in this browser automatically. Export a backup file now and then: clearing browser data
        would erase the library.
      </p>
      <div className="buttons">
        <button onClick={() => close(s.createCombination)}>New combination</button>
        <button onClick={() => close(s.duplicateCombination)}>Duplicate this one</button>
        <button onClick={() => void s.exportLibrary()}>Export backup</button>
        <button onClick={() => file.current?.click()}>Import…</button>
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

      <ul className="library-list">
        {s.library.length === 0 && <li className="hint">Nothing saved yet. Combinations save as soon as you change them.</li>}
        {s.library.map((c) => (
          <li key={c.id} className={c.id === s.combination.id ? 'current' : ''}>
            <button className="open" onClick={() => close(() => s.openCombination(c.id))}>
              <strong>{c.title || 'Untitled'}</strong>
              <span>
                {c.steps} step{c.steps === 1 ? '' : 's'} · {new Date(c.updatedAt).toLocaleString()}
              </span>
            </button>
            {confirming === c.id ? (
              <>
                <button onClick={() => void s.removeCombination(c.id).then(() => setConfirming(null))}>Delete for good</button>
                <button className="quiet" onClick={() => setConfirming(null)}>
                  Keep
                </button>
              </>
            ) : (
              <button className="quiet" onClick={() => setConfirming(c.id)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
