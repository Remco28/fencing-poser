import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState, type RefObject } from 'react';
import type { Vector3 } from 'three';
import { JOINT_BY_NAME } from '../model/joints.ts';
import { HEADING } from '../model/combination.ts';
import { angle } from '../model/types.ts';
import { solveRig, thumbClock } from '../rig/kinematics.ts';
import { NUDGE_KEYS, STEP } from './keyboard.ts';
import { GUIDE_COLORS } from './MotionGuides.tsx';
import { activePose, useEditor } from './store.ts';

/** Gap between the fencer and the controls, in pixels. */
const GAP = 24;

/**
 * Inside the canvas: keeps the controls beside the fencer being posed, clear
 * of their body and of the joint's guides, with a thin line to the joint.
 * Writes straight to the elements' styles each frame rather than
 * re-rendering React.
 */
export function HudTracker(props: {
  anchor: Vector3 | null;
  avoid: Vector3[];
  el: RefObject<HTMLDivElement | null>;
  leader: RefObject<SVGLineElement | null>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const box = props.el.current;
    const line = props.leader.current;
    if (!box) return;
    const toScreen = (p: Vector3) => {
      const n = p.clone().project(camera);
      return n.z > 1 ? null : { x: ((n.x + 1) / 2) * size.width, y: ((1 - n.y) / 2) * size.height };
    };
    const joint = props.anchor && toScreen(props.anchor);
    if (!joint) {
      box.style.visibility = 'hidden';
      line?.setAttribute('visibility', 'hidden');
      return;
    }
    const screen = props.avoid.map(toScreen).filter((p): p is { x: number; y: number } => !!p);
    const minX = Math.min(joint.x, ...screen.map((p) => p.x));
    const maxX = Math.max(joint.x, ...screen.map((p) => p.x));
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    // Beside the fencer on whichever side has room, nearer the joint's side first.
    const rightRoom = size.width - 12 - (maxX + GAP + w);
    const leftRoom = minX - GAP - w - 12;
    const preferRight = joint.x - minX > maxX - joint.x;
    let left: number;
    if (preferRight ? rightRoom >= 0 : leftRoom < 0 && rightRoom >= 0) left = maxX + GAP;
    else if (leftRoom >= 0) left = minX - GAP - w;
    else left = rightRoom > leftRoom ? size.width - w - 12 : 12;
    const top = Math.min(Math.max(64, joint.y - h / 2), size.height - h - 90);
    box.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    box.style.visibility = 'visible';
    if (line) {
      // From the nearer edge of the controls to the joint.
      const edgeX = left + w / 2 < joint.x ? left + w : left;
      const edgeY = Math.min(Math.max(joint.y, top + 16), top + h - 16);
      line.setAttribute('x1', String(edgeX));
      line.setAttribute('y1', String(edgeY));
      line.setAttribute('x2', String(joint.x));
      line.setAttribute('y2', String(joint.y));
      line.setAttribute('visibility', 'visible');
    }
  });
  return null;
}

const KEY_LABELS = NUDGE_KEYS.map(([down, up]) => [down[0].toUpperCase(), up[0].toUpperCase()]);

/** The selected joint's movements, with their keys, right beside the joint. */
export function JointHud({ el }: { el: RefObject<HTMLDivElement | null> }) {
  const s = useEditor();
  const [flash, setFlash] = useState<number | null>(null);

  // Light up the movement that just changed, briefly.
  useEffect(() => {
    if (!s.lastNudge) return;
    setFlash(s.lastNudge.dofIndex);
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [s.lastNudge]);

  if (!s.selected) return <div ref={el} className="joint-hud" hidden />;
  const joint = JOINT_BY_NAME[s.selected];
  const pose = activePose(s);
  const step = s.held.shift ? STEP.big : s.held.alt ? STEP.fine : STEP.normal;
  const setup = s.combination.fencers[s.active];
  const weaponSide = setup.handedness === 'right' ? 'r' : 'l';
  const handSide = joint.name === 'grip' ? weaponSide : joint.name === 'wrist_r' ? 'r' : joint.name === 'wrist_l' ? 'l' : null;
  const clock = handSide && thumbClock(solveRig(setup, pose, HEADING[s.active]), handSide, handSide === weaponSide);

  return (
    <div ref={el} className="joint-hud" role="group" aria-label={`${joint.label} controls`}>
      <div className="hud-head">
        <strong>
          {s.active} · {joint.label}
        </strong>
        <button className="link" onClick={() => s.select(null)} aria-label="Close" title="Deselect (Esc)">
          ×
        </button>
      </div>
      {joint.dofs.map((d, i) => {
        const value = angle(pose, joint.name, d.key);
        const atLimit = value <= d.min + 0.01 || value >= d.max - 0.01;
        // Labels read "increase / decrease" ("Forward / back"): ▶ is the first, ◀ the second.
        const [more, less] = d.label.split(' / ');
        return (
          <div
            key={d.key}
            className={`hud-row${flash === i ? ' flash' : ''}`}
            style={{ borderLeftColor: GUIDE_COLORS[i] }}
            title="The matching coloured path in the view shows where this movement goes"
          >
            <kbd>{KEY_LABELS[i][0]}</kbd>
            <button
              onClick={(e) => s.nudge(i, -(e.shiftKey ? STEP.big : e.altKey ? STEP.fine : step))}
              title={`${less ?? `Less ${d.label.toLowerCase()}`} (${KEY_LABELS[i][0]})`}
            >
              ◀
            </button>
            <span className="hud-label">
              {less ? (
                <span className="hud-dirs">
                  <span>{less}</span>
                  <span>{more}</span>
                </span>
              ) : (
                <span className="hud-dirs single">{more}</span>
              )}
              <output className={atLimit ? 'limit' : ''} title={atLimit ? 'At the end of its range' : undefined}>
                {Math.round(value * 2) / 2}°
              </output>
            </span>
            <button
              onClick={(e) => s.nudge(i, e.shiftKey ? STEP.big : e.altKey ? STEP.fine : step)}
              title={`${less ? more : `More ${d.label.toLowerCase()}`} (${KEY_LABELS[i][1]})`}
            >
              ▶
            </button>
            <kbd>{KEY_LABELS[i][1]}</kbd>
          </div>
        );
      })}
      {clock && (
        <p className="hud-clock" title="Seen from behind the hand, looking toward the point">
          Thumb at <strong>{clock.hour} o’clock</strong>
        </p>
      )}
      <p className="hud-mods">
        <span className={s.held.shift ? 'held' : ''}>
          <kbd>Shift</kbd> {STEP.big}°
        </span>
        <span className={!s.held.shift && !s.held.alt ? 'held' : ''}>{STEP.normal}°</span>
        <span className={s.held.alt ? 'held' : ''}>
          <kbd>Alt</kbd> {STEP.fine}°
        </span>
      </p>
      <p className="hud-more">
        <kbd>Tab</kbd> next joint · <kbd>X</kbd> other side · <kbd>R</kbd> straighten
      </p>
    </div>
  );
}
