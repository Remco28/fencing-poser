import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FENCERS, HEADING, targetParts, type Combination, type StepCamera } from '../model/combination.ts';
import { formatDistance, type Units } from '../model/units.ts';
import { Mannequin } from '../rig/Mannequin.tsx';
import { Environment } from '../scene/Environment.tsx';
import { measure, viewFor } from '../scene/measure.ts';
import { ReadoutLines } from '../scene/Readouts.tsx';
import { advance, frameAt, keyAt, keySteps } from '../viewer/player.ts';

// Exports render in their own hidden canvas at a fixed size, so pictures and
// videos never show the editor's handles, controls or selection, and the
// coach's view is left alone while they are made.

export interface Size {
  width: number;
  height: number;
}

function SetCamera({ view }: { view: StepCamera }) {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(...view.position);
    camera.lookAt(...view.target);
    camera.updateMatrixWorld();
  }, [camera, view]);
  return null;
}

/** The scene at a playback position, as a student would see it. */
function ExportScene({ c, pos }: { c: Combination; pos: number }) {
  const frame = frameAt(c, pos);
  const step = c.steps[keyAt(c, pos)];
  const display = step.display ?? {};
  const shown = { ...step, poses: frame.poses };
  const m = display.distance ? measure(c, shown) : null;
  return (
    <>
      <Environment />
      {FENCERS.map((f) => (
        <Mannequin
          key={f}
          label={f}
          setup={c.fencers[f]}
          pose={frame.poses[f]}
          heading={HEADING[f]}
          targets={(display.targets ?? []).filter((t) => t.fencer === f).flatMap((t) => targetParts(t.area, c.fencers[f]))}
        />
      ))}
      {m && <ReadoutLines m={m} />}
      <SetCamera view={frame.camera ?? viewFor('side', shown)} />
    </>
  );
}

/** Mount a hidden canvas, run `children` until they call back, then clean up. */
function offscreen<T>(size: Size, render: (done: (result: T) => void) => React.ReactNode): Promise<T> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-${size.width + 100}px;top:0;width:${size.width}px;height:${size.height}px;pointer-events:none;`;
    document.body.append(host);
    const root = createRoot(host);
    const done = (result: T) => {
      setTimeout(() => {
        root.unmount();
        host.remove();
      });
      resolve(result);
    };
    root.render(
      <Canvas shadows dpr={1} gl={{ preserveDrawingBuffer: true }} camera={{ fov: 40 }} style={{ width: size.width, height: size.height }}>
        {render(done)}
      </Canvas>,
    );
  });
}

function Stills(props: { c: Combination; positions: number[]; type: string; onDone: (urls: string[]) => void }) {
  const { c, positions, onDone } = props;
  const gl = useThree((s) => s.gl);
  const [k, setK] = useState(0);
  const frames = useRef(0);
  const urls = useRef<string[]>([]);
  useFrame(() => {
    // Give each step a few frames to settle (shadows, textures) before taking it.
    if (++frames.current < 4) return;
    frames.current = 0;
    urls.current.push(gl.domElement.toDataURL(props.type, 0.88));
    if (k + 1 < positions.length) setK(k + 1);
    else onDone(urls.current);
  });
  return <ExportScene c={c} pos={positions[k]} />;
}

/** Pictures of the given steps, as data URLs (PNG, or JPEG for print), without captions. */
export function renderStills(
  c: Combination,
  steps: number[],
  size: Size = { width: 1600, height: 1000 },
  type: 'image/png' | 'image/jpeg' = 'image/png',
): Promise<string[]> {
  return offscreen(size, (done) => <Stills c={c} positions={steps} type={type} onDone={done} />);
}

// ---- captions --------------------------------------------------------------

export interface Caption {
  title: string;
  step: string;
  notes?: string;
  readout?: string;
}

export function captionFor(c: Combination, index: number, units: Units): Caption {
  const keys = keySteps(c);
  const step = c.steps[index];
  const n = keys.indexOf(index) + 1;
  let readout: string | undefined;
  if (step.display?.distance) {
    const m = measure(c, step);
    const reach = (f: 'A' | 'B') =>
      m.reach[f].distance < 0.01 ? `${f}’s point: touch` : `${f}’s point to ${f === 'A' ? 'B' : 'A'}: ${formatDistance(m.reach[f].distance, units)}`;
    readout = `Front feet ${formatDistance(m.feet.distance, units)} · ${reach('A')} · ${reach('B')}`;
  }
  return {
    title: c.title,
    step: `Step ${n} of ${keys.length}${step.label ? ` · ${step.label}` : ''}`,
    notes: step.notes || undefined,
    readout,
  };
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw a caption band along the bottom of a 2D canvas. */
export function drawCaption(g: CanvasRenderingContext2D, caption: Caption, width: number, height: number, withNotes = true) {
  const pad = Math.round(width * 0.02);
  const big = Math.round(width * 0.022);
  const small = Math.round(width * 0.015);
  g.font = `${small}px system-ui, sans-serif`;
  const notes = withNotes && caption.notes ? wrap(g, caption.notes, width - pad * 2).slice(0, 3) : [];
  const lines = 1 + notes.length + (caption.readout ? 1 : 0);
  const band = pad * 2 + big * 1.3 + (lines - 1) * small * 1.4 + small * 1.4;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, height - band, width, band);
  let y = height - band + pad + small;
  g.fillStyle = '#646b73';
  g.font = `${small}px system-ui, sans-serif`;
  g.fillText(caption.title, pad, y);
  y += big * 1.3;
  g.fillStyle = '#1f2328';
  g.font = `600 ${big}px system-ui, sans-serif`;
  g.fillText(caption.step, pad, y);
  g.font = `${small}px system-ui, sans-serif`;
  g.fillStyle = '#3c4248';
  for (const line of notes) {
    y += small * 1.4;
    g.fillText(line, pad, y);
  }
  if (caption.readout) {
    y += small * 1.4;
    g.fillStyle = '#2b6cb0';
    g.fillText(caption.readout, pad, y);
  }
}

/** A step picture with its caption, as a PNG blob. */
export async function captionedPicture(c: Combination, index: number, units: Units): Promise<Blob> {
  const size = { width: 1600, height: 1000 };
  const [url] = await renderStills(c, [index], size);
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = Object.assign(document.createElement('canvas'), size);
  const g = canvas.getContext('2d')!;
  g.drawImage(img, 0, 0);
  drawCaption(g, captionFor(c, index, units), size.width, size.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

// ---- video -----------------------------------------------------------------

const HOLD_START_MS = 900;
const HOLD_END_MS = 1500;

function pickVideoType(): string {
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
}

function Recorder(props: {
  c: Combination;
  size: Size;
  speed: number;
  units: Units;
  onProgress: (fraction: number) => void;
  onDone: (video: Blob) => void;
}) {
  const { c, size } = props;
  const gl = useThree((s) => s.gl);
  const [pos, setPos] = useState(0);
  const clock = useRef({ held: 0, phase: 'start' as 'start' | 'play' | 'end' | 'done' });
  const recorder = useRef<MediaRecorder | null>(null);
  const composite = useRef<CanvasRenderingContext2D | null>(null);
  const end = c.steps.length - 1;

  useEffect(() => {
    // Record a 2D canvas that copies each rendered frame and adds the caption.
    const canvas = Object.assign(document.createElement('canvas'), size);
    composite.current = canvas.getContext('2d');
    const type = pickVideoType();
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => props.onDone(new Blob(chunks, { type: type.split(';')[0] }));
    rec.start(250);
    recorder.current = rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const g = composite.current;
    const t = clock.current;
    if (!g || t.phase === 'done') return;
    g.drawImage(gl.domElement, 0, 0, size.width, size.height);
    drawCaption(g, captionFor(c, keyAt(c, pos), props.units), size.width, size.height, false);
    // Real elapsed time, so the video plays at true speed even if frames come slowly.
    const ms = Math.min(delta, 0.5) * 1000;
    if (t.phase === 'start' && (t.held += ms) >= HOLD_START_MS) t.phase = 'play';
    else if (t.phase === 'play') {
      const next = advance(c, pos, ms * props.speed, end);
      setPos(next);
      props.onProgress(end ? next / end : 1);
      if (next >= end) {
        t.phase = 'end';
        t.held = 0;
      }
    } else if (t.phase === 'end' && (t.held += ms) >= HOLD_END_MS) {
      t.phase = 'done';
      recorder.current?.stop();
    }
  });

  return <ExportScene c={c} pos={pos} />;
}

/** Record smooth playback of the whole combination, in real time. */
export function recordVideo(
  c: Combination,
  options: { speed: number; units: Units; size?: Size; onProgress?: (fraction: number) => void },
): Promise<Blob> {
  const size = options.size ?? { width: 1280, height: 800 };
  return offscreen(size, (done) => (
    <Recorder c={c} size={size} speed={options.speed} units={options.units} onProgress={options.onProgress ?? (() => {})} onDone={done} />
  ));
}

export function videoExtension(blob: Blob): string {
  return blob.type.includes('mp4') ? 'mp4' : 'webm';
}
