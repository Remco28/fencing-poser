import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { WOOD_OF } from '../design.ts';
import { Handles } from '../ik/Handles.tsx';
import { PathHandles } from '../ik/PathHandles.tsx';
import { FENCERS, HEADING, targetParts } from '../model/combination.ts';
import { JOINT_NAMES } from '../model/joints.ts';
import { balanceOf } from '../rig/balance.ts';
import { jointPosition, solveRig } from '../rig/kinematics.ts';
import { Mannequin } from '../rig/Mannequin.tsx';
import { BalanceMark } from '../scene/BalanceMark.tsx';
import { CameraRig } from '../scene/CameraRig.tsx';
import { ClearView } from '../scene/ClearView.tsx';
import { Environment } from '../scene/Environment.tsx';
import { FitRig } from '../scene/FitRig.tsx';
import { EDITOR_FOV } from '../scene/frame.ts';
import { measure } from '../scene/measure.ts';
import { Ticker } from '../scene/playback.tsx';
import { PointTrail } from '../scene/PointTrail.tsx';
import { ReadoutLines } from '../scene/Readouts.tsx';
import { frameAt, keyAt } from '../viewer/player.ts';
import { HudTracker, JointHud } from './JointHud.tsx';
import { guidesFor, MotionGuides, useRecentNudge } from './MotionGuides.tsx';
import { currentStep, useEditor } from './store.ts';
import { ThumbDial } from './ThumbDial.tsx';
import { useUi } from './ui.ts';
import { clearNow, pointsOf } from './views.ts';

/**
 * The 3D view: the two fencers on the desk, and everything drawn on them
 * (handles, guides, paths, measurements). It fills the whole window, behind
 * the panels; the camera keeps its subject in the part that is clear.
 */
export function Stage() {
  const s = useEditor();
  const desk = useUi((u) => u.desk);
  const posing = useUi((u) => u.posing);
  const clear = useUi((u) => u.clear);
  const editingStep = currentStep(s);
  // While previewing, show the in-between frame and the step it belongs to.
  const playing = !!s.preview;
  const frame = useMemo(() => (s.preview ? frameAt(s.combination, s.preview.pos) : null), [s.preview, s.combination]);
  const step = s.preview ? { ...s.combination.steps[keyAt(s.combination, s.preview.pos)], poses: frame!.poses } : editingStep;
  // Shaping the movement into this step: poses are fixed, paths can be bent.
  const shaping = s.pathEdit && s.stepIndex > 0 && !playing;
  // The step before: the last real (not motion-only) one, so the ghost and the
  // point trail cover the whole move.
  const previousIndex = (() => {
    if (shaping) return s.stepIndex - 1;
    for (let i = s.stepIndex - 1; i >= 0; i--) if (!s.combination.steps[i].motionOnly) return i;
    return s.stepIndex - 1;
  })();
  const previous = !playing && !desk && previousIndex >= 0 ? s.combination.steps[previousIndex] : null;
  const display = step.display ?? {};
  const showPast = !!previous && (shaping || !!display.ghost);
  const m = useMemo(() => (display.distance && !desk ? measure(s.combination, step) : null), [display.distance, desk, s.combination, step]);
  // Off-balance warnings, for poses the coach makes (not while playing).
  const balances = useMemo(
    () =>
      playing || desk
        ? []
        : FENCERS.flatMap((f) => {
            if (step.poses[f].root.lift > 0) return [];
            const b = balanceOf(solveRig(s.combination.fencers[f], step.poses[f], HEADING[f]));
            return b.outside > 0 ? [{ f, b }] : [];
          }),
    [playing, desk, step, s.combination.fencers],
  );
  const hud = useRef<HTMLDivElement>(null);
  const leader = useRef<SVGLineElement>(null);
  const recent = useRecentNudge(s.lastNudge);

  const activeRig = useMemo(
    () => solveRig(s.combination.fencers[s.active], step.poses[s.active], HEADING[s.active]),
    [s.active, s.combination.fencers, step],
  );
  // Where the selected joint is, so its controls can sit beside it.
  const selectedPoint = useMemo(() => {
    if (!s.selected) return null;
    return s.selected === 'grip' ? activeRig.guard.clone() : jointPosition(activeRig, s.selected);
  }, [s.selected, activeRig]);
  const weaponSide = s.combination.fencers[s.active].handedness === 'right' ? 'r' : 'l';
  // The thumb clock shows for the weapon hand's wrist and grip, and for the other hand's wrist.
  const dialSide = s.selected === 'grip' ? weaponSide : s.selected === 'wrist_r' ? 'r' : s.selected === 'wrist_l' ? 'l' : null;

  const guides = useMemo(
    () =>
      s.selected ? guidesFor(s.combination.fencers[s.active], step.poses[s.active], HEADING[s.active], s.selected, s.spineTogether) : [],
    [s.selected, s.active, s.combination.fencers, step, s.spineTogether],
  );
  // The controls keep clear of the whole fencer being posed and of the guides.
  const hudAvoid = useMemo(
    () =>
      selectedPoint
        ? [
            ...JOINT_NAMES.map((j) => jointPosition(activeRig, j)),
            jointPosition(activeRig, 'neck').add(new Vector3(0, 0.17 * activeRig.layout.height, 0)),
            ...guides.flatMap((g) => [g.points[0], g.points[g.points.length - 1]]),
          ]
        : [],
    [selectedPoint, guides, activeRig],
  );

  return (
    <>
      <Canvas
        shadows
        frameloop="demand"
        camera={{ position: [-2.4, 4.4, 9.5], fov: EDITOR_FOV }}
        // A click on the bare desk lets go of the joint. It does not put the fencer
        // down: a click that just misses an arm would close the tray (Esc or its × do that).
        onPointerMissed={() => !desk && s.select(null)}
        gl={{ preserveDrawingBuffer: true }}
      >
        <Environment things={desk ? (step.poses.A.root.x + step.poses.B.root.x) / 2 : undefined} />
        {FENCERS.map((f) => (
          <Mannequin
            key={f}
            label={s.showLabels && !desk ? f : undefined}
            active={s.active === f && posing && !playing}
            setup={s.combination.fencers[f]}
            pose={step.poses[f]}
            heading={HEADING[f]}
            wood={WOOD_OF[f]}
            selected={s.active === f ? s.selected : null}
            targets={(display.targets ?? [])
              .filter((t) => t.fencer === f)
              .flatMap((t) => targetParts(t.area, s.combination.fencers[f]))}
            onSelect={
              shaping
                ? undefined
                : (joint) => {
                    // On the desk, picking up a figure opens the combination; a first
                    // click on a fencer picks them, and the next picks a joint.
                    if (desk) return useUi.getState().leaveDesk();
                    if (posing && s.active === f) return s.select(joint, f);
                    s.setActive(f);
                    useUi.getState().setPosing(true);
                  }
            }
            onActivate={() => {
              s.setActive(f);
              useUi.getState().setPosing(true);
            }}
          />
        ))}
        {showPast &&
          previous &&
          FENCERS.map((f) => (
            <Mannequin
              key={`ghost-${f}-${previous.id}`}
              ghost
              wood={WOOD_OF[f]}
              setup={s.combination.fencers[f]}
              pose={previous.poses[f]}
              heading={HEADING[f]}
            />
          ))}
        {showPast && (
          <PointTrail
            c={s.combination}
            from={previousIndex}
            to={s.stepIndex}
            onClick={shaping ? undefined : () => s.editPath(s.stepIndex)}
          />
        )}
        {shaping && <PathHandles c={s.combination} to={s.stepIndex} />}
        {m && <ReadoutLines m={m} />}
        {balances.map(({ f, b }) => (
          <BalanceMark key={f} balance={b} />
        ))}
        {s.selected && <MotionGuides guides={guides} active={recent ?? s.hotDof} />}
        {dialSide && <ThumbDial rig={activeRig} side={dialSide} weapon={dialSide === weaponSide} />}
        {posing && s.handles && !s.selected && !playing && !shaping && (
          <Handles setup={s.combination.fencers[s.active]} pose={step.poses[s.active]} heading={HEADING[s.active]} />
        )}
        <OrbitControls
          target={[0, 0.9, 0]}
          makeDefault
          maxPolarAngle={Math.PI * 0.495}
          // The view is the coach's own, playing or not: it moves only when they move it.
          zoomToCursor
        />
        <ClearView clear={clear} />
        {s.preview?.playing && <Ticker onTick={s.tickPreview} />}
        <CameraRig flight={s.flight} onView={s.setView} />
        <FitRig
          request={s.fitRequest}
          points={() => pointsOf(s.combination, step, s.fitRequest?.who ?? 'both')}
          onView={s.requestView}
          clear={clearNow}
        />
        <HudTracker anchor={selectedPoint} avoid={hudAvoid} el={hud} leader={leader} within={clearNow} />
      </Canvas>

      <svg className="hud-leader" aria-hidden>
        <line ref={leader} />
      </svg>
      <JointHud el={hud} />
    </>
  );
}
