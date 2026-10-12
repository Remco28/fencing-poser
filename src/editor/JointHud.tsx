import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState, type RefObject } from 'react';
import type { Vector3 } from 'three';
import { JOINT_BY_NAME } from '../model/joints.ts';
import { angle } from '../model/types.ts';
import { NUDGE_KEYS, STEP } from './keyboard.ts';
import { activePose, useEditor } from './store.ts';

/** Gap between the joint and the controls, in pixels. */
const GAP = 28;

/**
 * Inside the canvas: keeps the controls next to the selected joint as the
 * camera moves, writing straight to the element's style each frame rather
 * than re-rendering React.
 */
export function HudTracker({ point, el }: { point: Vector3 | null; el: RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const box = el.current;
    if (!box) return;
    if (!point) {
      box.style.visibility = 'hidden';
      return;
    }
    const ndc = point.clone().project(camera);
    if (ndc.z > 1) {
      box.style.visibility = 'hidden';
      return;
    }
    const x = ((ndc.x + 1) / 2) * size.width;
    const y = ((1 - ndc.y) / 2) * size.height;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    // To the right of the joint, or to the left if there is no room; always inside the stage.
    const left = x + GAP + w < size.width - 8 ? x + GAP : Math.max(8, x - GAP - w);
    const top = Math.min(Math.max(64, y - h / 2), size.height - h - 90);
    box.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    box.style.visibility = 'visible';
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
          <div key={d.key} className={`hud-row${flash === i ? ' flash' : ''}`}>
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
