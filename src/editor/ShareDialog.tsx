import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { appAddress, encodeCombination } from '../share/link.ts';
import { useEditor } from './store.ts';

/** Above this, a QR code gets too dense to scan reliably from a screen. */
const QR_LIMIT = 2200;

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const combination = useEditor((s) => s.combination);
  const dialog = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setCopied(false);
    void encodeCombination(combination).then(async (hash) => {
      const url = appAddress() + hash;
      const image = url.length <= QR_LIMIT ? await QRCode.toDataURL(url, { errorCorrectionLevel: 'L', margin: 1, width: 360 }) : '';
      if (live) {
        setLink(url);
        setQr(image);
      }
    });
    return () => {
      live = false;
    };
  }, [open, combination]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog ref={dialog} className="library share" onClose={onClose}>
      <div className="section-head">
        <h2>Share “{combination.title}”</h2>
        <button className="link" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="hint">
        Students open this link on any phone or computer to step through or play the combination. They cannot change
        it. The link <em>is</em> the combination: nothing is stored online, and if you edit the combination later, send a
        new link.
      </p>
      {local && (
        <p className="message">
          This copy of the app is running on your own computer, so the link only opens here. Links work for students once
          the app is hosted (for example on GitHub Pages).
        </p>
      )}
      <div className="share-row">
        <input className="wide" readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} />
        <button className="primary" onClick={() => void copy()} disabled={!link}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a className="button" href={link} target="_blank" rel="noreferrer">
          Open viewer
        </a>
      </div>
      <p className="hint">{link.length.toLocaleString()} characters</p>
      {qr ? (
        <figure className="qr">
          <img src={qr} alt="QR code for the share link" width={240} height={240} />
          <figcaption>Show this at practice; students scan it with their phone camera.</figcaption>
        </figure>
      ) : (
        link && <p className="hint">This combination is too long for a QR code. Send the link instead.</p>
      )}
    </dialog>
  );
}
