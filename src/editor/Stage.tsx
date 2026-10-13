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
import { guidesFor, MotionGuides, useRecentNudge } from './MotionGuides.tsx';
import { ThumbDial } from './ThumbDial.tsx';
import { measure, rigsFor, VIEW_NAMES, viewFor, type ViewName } from '../scene/measure.ts';
import { Environment } from '../scene/Environment.tsx';
import { ReadoutLines } from '../scene/Readouts.tsx';
import { BalanceMark } from '../scene/BalanceMark.tsx';
import { balanceOf } from '../rig/balance.ts';
import { formatDistance } from '../model/units.ts';
import { currentStep, useEditor } from './store.ts';
import { Switch } from '../ui/Switch.tsx';
import { CameraDriver, Ticker } from '../scene/playback.tsx';
import { frameAt, keyAt } from '../viewer/player.ts';

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
  const editingStep = currentStep(s);
  // While previewing, show the in-between frame and the step it belongs to.
  const playing = !!s.preview;
  const frame = useMemo(() => (s.preview ? frameAt(s.combination, s.preview.pos) : null), [s.preview, s.combination]);
  const step = s.preview ? { ...s.combination.steps[keyAt(s.combination, s.preview.pos)], poses: frame!.poses } : editingStep;
  const previous = !playing && s.stepIndex > 0 ? s.combination.steps[s.stepIndex - 1] : null;
  const display = step.display ?? {};
  const m = useMemo(() => (display.distance ? measure(s.combination, step) : null), [display.distance, s.combination, step]);
  // Off-balance warnings, for poses the coach makes (not while playing).
  const balances = useMemo(
    () =>
      playing
        ? []
        : FENCERS.flatMap((f) => {
            if (step.poses[f].root.lift > 0) return [];
            const b = balanceOf(solveRig(s.combination.fencers[f], step.poses[f], HEADING[f]));
            return b.outside > 0 ? [{ f, b }] : [];
          }),
    [playing, step, s.combination.fencers],
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
    () => (s.selected ? guidesFor(s.combination.fencers[s.active], step.poses[s.active], HEADING[s.active], s.selected) : []),
    [s.selected, s.active, s.combination.fencers, step],
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
            label={s.showLabels ? f : undefined}
            active={s.active === f && !playing}
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
        {balances.map(({ f, b }) => (
          <BalanceMark key={f} balance={b} />
        ))}
        {s.selected && <MotionGuides guides={guides} active={recent} />}
        {dialSide && <ThumbDial rig={activeRig} side={dialSide} weapon={dialSide === weaponSide} />}
        {s.handles && !s.selected && !playing && (
          <Handles setup={s.combination.fencers[s.active]} pose={step.poses[s.active]} heading={HEADING[s.active]} />
        )}
        <OrbitControls target={[0, 0.9, 0]} makeDefault maxPolarAngle={Math.PI * 0.495} enabled={!s.cameraLocked && !playing} />
        {playing && <Ticker onTick={s.tickPreview} />}
        {playing && <CameraDriver view={frame?.camera ?? viewFor('side', step)} />}
        <CameraRig flight={s.flight} onView={s.setStepCamera} />
        <FitRig request={s.fitRequest} points={fitPoints} onView={s.requestView} />
        <HudTracker anchor={selectedPoint} avoid={hudAvoid} el={hud} leader={leader} />
      </Canvas>

      <svg className="hud-leader" aria-hidden>
        <line ref={leader} />
      </svg>
      <JointHud el={hud} />

      <div className="stage-tools" aria-hidden={playing || undefined}>
        <div className="tool-group" role="toolbar" aria-label="Camera">
          <span className="group-label">Camera</span>
          {(Object.keys(VIEW_NAMES) as ViewName[]).map((v) => (
            <button key={v} onClick={() => s.requestView(viewFor(v, step))} disabled={s.cameraLocked || playing}>
              {VIEW_NAMES[v]}
            </button>
          ))}
          <span className="divider" />
          <button onClick={() => s.requestFit('both')} disabled={s.cameraLocked || playing} title="Zoom so both fencers fill the view (Z)">
            Zoom to both
          </button>
          <button
            onClick={() => s.requestFit(s.active)}
            disabled={s.cameraLocked || playing}
            title={`Zoom in on fencer ${s.active}, the one you are posing (Shift+Z)`}
          >
            Zoom to {s.active}
          </button>
          <span className="divider" />
          <Switch on={s.cameraLocked} onToggle={s.toggleCameraLock} title="When on, the camera cannot be moved by accident (L)">
            Lock
          </Switch>
          <Switch
            on={!!s.combination.sharedView}
            onToggle={s.toggleSharedView}
            title="When on, every step uses this one view: moving the camera on any step moves it for all"
          >
            One view for all steps
          </Switch>
        </div>
        <div className="tool-group" role="toolbar" aria-label="Show">
          <span className="group-label">Show</span>
          <Switch on={!!display.distance} onToggle={() => s.setDisplay({ distance: !display.distance })} disabled={playing} title="Distances for this step">
            Distance
          </Switch>
          <Switch
            on={!!display.ghost}
            onToggle={() => s.setDisplay({ ghost: !display.ghost })}
            disabled={!previous && !display.ghost}
            title={s.stepIndex > 0 ? 'Show the previous step faintly, for this step' : 'The first step has nothing before it'}
          >
            Ghost
          </Switch>
          <Switch on={s.showLabels} onToggle={s.toggleLabels} title="The A and B tags above the fencers">
            Labels
          </Switch>
        </div>
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
