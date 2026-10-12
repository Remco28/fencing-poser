import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistance, type Units } from '../model/units.ts';
import { FENCERS, HEADING, targetParts, type Combination } from '../model/combination.ts';
import { Mannequin } from '../rig/Mannequin.tsx';
import { CameraRig, type Flight } from '../scene/CameraRig.tsx';
import { CameraDriver, Ticker } from '../scene/playback.tsx';
import { Environment } from '../scene/Environment.tsx';
import { measure, viewFor } from '../scene/measure.ts';
import { ReadoutLines } from '../scene/Readouts.tsx';
import { advance, frameAt, keyAt, keySteps, nextKey, prevKey } from './player.ts';

type Mode = 'steps' | 'smooth';

/** Read-only player for a shared combination: what a student sees. */
export function Viewer({ combination: c, units = 'metric' }: { combination: Combination; units?: Units }) {
  const keys = keySteps(c);
  const [mode, setMode] = useState<Mode>('steps');
  const [pos, setPos] = useState(keys[0]);
  const [playing, setPlaying] = useState(false);
  const [stopAt, setStopAt] = useState(keys[0]);
  const [speed, setSpeed] = useState(1);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flights = useRef(0);

  const frame = useMemo(() => frameAt(c, pos), [c, pos]);
  const key = keyAt(c, pos);
  const keyIndex = keys.indexOf(key);
  const step = c.steps[key];
  const display = step.display ?? {};
  const shown = { ...step, poses: frame.poses };
  const m = useMemo(() => (display.distance ? measure(c, shown) : null), [display.distance, c, frame]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghostOf = mode === 'steps' && display.ghost ? c.steps[keys[keyIndex - 1]] : undefined;

  const flyTo = (index: number) => {
    const step = c.steps[index];
    setFlight({ camera: step.camera ?? viewFor('side', step), id: ++flights.current, save: false });
  };

  // Start from the first step's view.
  useEffect(() => flyTo(keys[0]), []); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (index: number | undefined) => {
    if (index === undefined) return;
    setPlaying(false);
    setPos(index);
    flyTo(index);
  };

  const next = () => {
    const to = nextKey(c, pos);
    if (to === undefined) return;
    if (mode === 'steps') return goTo(to);
    setStopAt(to);
    setPlaying(true);
  };

  const play = () => {
    if (playing) return setPlaying(false);
    const end = c.steps.length - 1;
    if (pos >= end - 1e-6) setPos(keys[0]);
    setStopAt(end);
    setPlaying(true);
  };

  const onTick = (ms: number) => {
    if (!playing) return;
    const p = advance(c, pos, ms * speed, stopAt);
    setPos(p);
    if (p >= stopAt - 1e-6) setPlaying(false);
  };

  const switchMode = (to: Mode) => {
    setMode(to);
    setPlaying(false);
    if (to === 'steps') goTo(keyAt(c, pos));
  };

  // Keyboard: arrows step, space plays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') goTo(prevKey(c, pos));
      else if (e.key === ' ') {
        e.preventDefault();
        if (mode === 'smooth') play();
        else next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="viewer">
      <Canvas shadows camera={{ position: [0.6, 2.8, 8.4], fov: 40 }}>
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
        {ghostOf &&
          FENCERS.map((f) => (
            <Mannequin key={`ghost-${f}-${ghostOf.id}`} ghost setup={c.fencers[f]} pose={ghostOf.poses[f]} heading={HEADING[f]} />
          ))}
        {m && <ReadoutLines m={m} />}
        <OrbitControls target={[0, 0.9, 0]} makeDefault maxPolarAngle={Math.PI * 0.495} />
        <CameraRig flight={flight} fitAspect />
        {playing && <CameraDriver fit view={frame.camera ?? viewFor('side', shown)} />}
        <Ticker onTick={onTick} />
      </Canvas>

      <header className="viewer-top">
        <h1>{c.title}</h1>
        <div className="viewer-top-tools">
          <div className="toggle" role="radiogroup" aria-label="Playback">
            <div>
              {(['steps', 'smooth'] as Mode[]).map((v) => (
                <button key={v} role="radio" aria-checked={mode === v} className={mode === v ? 'on' : ''} onClick={() => switchMode(v)}>
                  {v === 'steps' ? 'Steps' : 'Smooth'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => flyTo(key)} title="Back to this step's view">
            Reset view
          </button>
        </div>
      </header>

      {m && (
        <dl className="readouts viewer-readouts">
          <dt>Between front feet</dt>
          <dd>{formatDistance(m.feet.distance, units)}</dd>
          {FENCERS.map((f) => (
            <div key={f}>
              <dt>
                {f}’s point to {f === 'A' ? 'B' : 'A'}
              </dt>
              <dd className={m.reach[f].distance < 0.01 ? 'touch' : ''}>
                {m.reach[f].distance < 0.01 ? 'Touch' : formatDistance(m.reach[f].distance, units)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <section className="viewer-card" aria-live="polite">
        <p className="viewer-step">
          Step {keyIndex + 1} of {keys.length}
          {step.label && <strong> · {step.label}</strong>}
        </p>
        {step.notes && <p className="viewer-notes">{step.notes}</p>}
        <div className="viewer-controls">
          <button onClick={() => goTo(prevKey(c, pos))} disabled={prevKey(c, pos) === undefined} aria-label="Previous step">
            ‹ Prev
          </button>
          {mode === 'smooth' && (
            <button className="primary" onClick={play} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
          )}
          <button onClick={next} disabled={nextKey(c, pos) === undefined} aria-label="Next step">
            Next ›
          </button>
          {mode === 'smooth' && (
            <select aria-label="Speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.25}>¼ speed</option>
              <option value={0.5}>½ speed</option>
              <option value={1}>Full speed</option>
            </select>
          )}
        </div>
        <ol className="viewer-dots" aria-hidden>
          {keys.map((k, i) => (
            <li key={k} className={i === keyIndex ? 'on' : ''} />
          ))}
        </ol>
      </section>
    </div>
  );
}
