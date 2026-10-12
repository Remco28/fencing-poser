import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { Handles } from '../ik/Handles.tsx';
import { FENCERS, HEADING, targetParts } from '../model/combination.ts';
import { Mannequin } from '../rig/Mannequin.tsx';
import { CameraRig } from '../scene/CameraRig.tsx';
import { FitRig } from '../scene/FitRig.tsx';
import { jointPosition, solveRig } from '../rig/kinematics.ts';
import { JOINT_NAMES } from '../model/joints.ts';
import { HudTracker, JointHud } from './JointHud.tsx';
import { measure, rigsFor, VIEW_NAMES, viewFor, type ViewName } from '../scene/measure.ts';
import { Environment } from '../scene/Environment.tsx';
import { ReadoutLines } from '../scene/Readouts.tsx';
import { formatDistance } from '../model/units.ts';
import { currentStep, useEditor } from './store.ts';

// Dev aid: ?view=top|front|back|side|near|nearback|nearfront picks the start view.
const VIEWS: Record<string, [number, number, number]> = {
  side: [0, 1.3, 8],
  top: [0, 9, 0.01],
  front: [7, 1.6, 0.6],
  back: [-7, 1.6, 0.6],
  near: [0.6, 1.3, 2.6],
  nearback: [-2.2, 1.5, -1.2],
  nearfront: [2.6, 1.3, 0.6],
};
const START = VIEWS[new URLSearchParams(location.search).get('view') ?? ''] ?? [0.6, 2.8, 8.4];

export function Stage() {
  const s = useEditor();
  const step = currentStep(s);
  const previous = s.stepIndex > 0 ? s.combination.steps[s.stepIndex - 1] : null;
  const display = step.display ?? {};
  const m = useMemo(() => (display.distance ? measure(s.combination, step) : null), [display.distance, s.combination, step]);
  const hud = useRef<HTMLDivElement>(null);

  // Where the selected joint is, so its controls can sit beside it.
  const selectedPoint = useMemo(() => {
    if (!s.selected) return null;
    const rig = solveRig(s.combination.fencers[s.active], step.poses[s.active], HEADING[s.active]);
    return s.selected === 'grip' ? rig.guard.clone() : jointPosition(rig, s.selected);
  }, [s.selected, s.active, s.combination.fencers, step]);

  /** Everything to keep in frame: every joint, the head and the point. */
  const fitPoints = () => {
    const rigs = rigsFor(s.combination, step);
    const who = s.fitRequest?.who ?? 'both';
    return FENCERS.filter((f) => who === 'both' || who === f).flatMap((f) => {
      const rig = rigs[f];
      const head = jointPosition(rig, 'neck').add(new Vector3(0, 0.17 * rig.layout.height, 0));
      return [...JOINT_NAMES.map((j) => jointPosition(rig, j)), head, rig.tip.clone(), new Vector3(jointPosition(rig, 'pelvis').x, 0, 0)];
    });
  };

  return (
    <>
      <Canvas
        shadows
        camera={{ position: START, fov: 40 }}
        onPointerMissed={() => s.select(null)}
        gl={{ preserveDrawingBuffer: true }}
      >
        <Environment />
        {FENCERS.map((f) => (
          <Mannequin
            key={f}
            label={f}
            active={s.active === f}
            setup={s.combination.fencers[f]}
            pose={step.poses[f]}
            heading={HEADING[f]}
            selected={s.active === f ? s.selected : null}
            targets={(display.targets ?? [])
              .filter((t) => t.fencer === f)
              .flatMap((t) => targetParts(t.area, s.combination.fencers[f]))}
            onSelect={(joint) => s.select(joint, f)}
            onActivate={() => s.setActive(f)}
          />
        ))}
        {display.ghost &&
          previous &&
          FENCERS.map((f) => (
            <Mannequin
              key={`ghost-${f}-${previous.id}`}
              ghost
              setup={s.combination.fencers[f]}
              pose={previous.poses[f]}
              heading={HEADING[f]}
            />
          ))}
        {m && <ReadoutLines m={m} />}
        {s.handles && (
          <Handles setup={s.combination.fencers[s.active]} pose={step.poses[s.active]} heading={HEADING[s.active]} />
        )}
        <OrbitControls target={[0, 0.9, 0]} makeDefault maxPolarAngle={Math.PI * 0.495} enabled={!s.cameraLocked} />
        <CameraRig flight={s.flight} onView={s.setStepCamera} />
        <FitRig request={s.fitRequest} points={fitPoints} onView={s.requestView} />
        <HudTracker point={selectedPoint} el={hud} />
      </Canvas>

      <JointHud el={hud} />

      <div className="stage-tools" role="toolbar" aria-label="View">
        {(Object.keys(VIEW_NAMES) as ViewName[]).map((v) => (
          <button key={v} onClick={() => s.requestView(viewFor(v, step))} disabled={s.cameraLocked}>
            {VIEW_NAMES[v]}
          </button>
        ))}
        <button onClick={() => s.requestFit('both')} disabled={s.cameraLocked} title="Frame both fencers (Z)">
          Fit both
        </button>
        <button onClick={() => s.requestFit(s.active)} disabled={s.cameraLocked} title="Frame the fencer you are posing (Shift+Z)">
          Fit {s.active}
        </button>
        <span className="divider" />
        <button
          aria-pressed={s.cameraLocked}
          onClick={s.toggleCameraLock}
          title="Lock the camera so it cannot be moved by accident (L)"
        >
          {s.cameraLocked ? '🔒 View locked' : '🔓 Lock view'}
        </button>
        <button
          onClick={s.useViewForAllSteps}
          disabled={!step.camera || s.combination.steps.length < 2}
          title="Give every step this view, so the shot stays the same throughout"
        >
          Same view for all steps
        </button>
        <span className="divider" />
        <button aria-pressed={!!display.distance} onClick={() => s.setDisplay({ distance: !display.distance })}>
          Distance
        </button>
        <button
          aria-pressed={!!display.ghost}
          disabled={!previous}
          title={previous ? 'Show the previous step faintly' : 'The first step has nothing before it'}
          onClick={() => s.setDisplay({ ghost: !display.ghost })}
        >
          Ghost
        </button>
      </div>

      {m && (
        <dl className="readouts">
          <dt>Between front feet</dt>
          <dd>{formatDistance(m.feet.distance, s.units)}</dd>
          {FENCERS.map((f) => (
            <div key={f}>
              <dt>
                {f}’s point to {f === 'A' ? 'B' : 'A'}
              </dt>
              <dd className={m.reach[f].distance < 0.01 ? 'touch' : ''}>
                {m.reach[f].distance < 0.01 ? 'Touch' : formatDistance(m.reach[f].distance, s.units)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
