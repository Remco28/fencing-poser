import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { download, libraryFile } from '../library/backup.ts';
import { appAddress, encodeCombination } from '../share/link.ts';
import { keySteps } from '../viewer/player.ts';
import { useEditor } from './store.ts';

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'combination';
}

/** Above this, a QR code gets too dense to scan reliably from a screen. */
const QR_LIMIT = 2200;

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const combination = useEditor((s) => s.combination);
  const stepIndex = useEditor((s) => s.stepIndex);
  const units = useEditor((s) => s.units);
  const [busy, setBusy] = useState('');
  const [speed, setSpeed] = useState(1);
  const name = slug(combination.title);
  const stepIsVia = !!combination.steps[stepIndex].motionOnly;

  /** Run one export at a time, saying what is happening. */
  const run = async (what: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(what);
    try {
      await work();
      setBusy('');
    } catch (error) {
      console.error(error);
      setBusy(`That did not work: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const exportPicture = () =>
    run('Drawing the picture…', async () => {
      const { captionedPicture } = await import('../export/render.tsx');
      download(`${name}-step-${keySteps(combination).indexOf(stepIndex) + 1}.png`, await captionedPicture(combination, stepIndex, units));
    });

  const exportHandout = () =>
    run('Making the handout…', async () => {
      const { handoutPdf } = await import('../export/handout.ts');
      download(`${name}-handout.pdf`, await handoutPdf(combination, units, setBusy));
    });

  const exportVideo = () =>
    run('Recording…', async () => {
      const { recordVideo, videoExtension } = await import('../export/render.tsx');
      const video = await recordVideo(combination, {
        speed,
        units,
        onProgress: (f) => setBusy(`Recording the playback in real time… ${Math.round(f * 100)}%`),
      });
      download(`${name}.${videoExtension(video)}`, video);
    });

  const exportFile = () =>
    run('Saving…', async () => {
      download(`${name}.fencing-poser.json`, JSON.stringify(libraryFile([], [combination]), null, 1));
    });
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
        <h2>Share and export “{combination.title}”</h2>
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

      <h3 className="export-head">Export</h3>
      <div className="export-grid">
        <button onClick={() => void exportPicture()} disabled={!!busy || stepIsVia}>
          <strong>This step as a picture</strong>
          <span>{stepIsVia ? 'Not for a motion-only step' : 'PNG with the label, notes and distances'}</span>
        </button>
        <button onClick={() => void exportHandout()} disabled={!!busy}>
          <strong>Handout</strong>
          <span>PDF: every step with its picture and notes, ready to print</span>
        </button>
        <button onClick={() => void exportVideo()} disabled={!!busy}>
          <strong>Video</strong>
          <span>Smooth playback, recorded in real time</span>
        </button>
        <button onClick={() => void exportFile()} disabled={!!busy}>
          <strong>Combination file</strong>
          <span>To keep, or to open in another browser through Library → Import</span>
        </button>
      </div>
      <label className="inline">
        <span>Video speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={!!busy}>
          <option value={0.5}>Half speed</option>
          <option value={1}>Full speed</option>
        </select>
      </label>
      {busy && <p className="message">{busy}</p>}
    </dialog>
  );
}
