import { JOINT_NAMES } from './joints.ts';
import type { Step, StepCamera, Vec3 } from './combination.ts';
import type { JointAngles, Pose } from './types.ts';

// In-between frames for smooth playback. Joints move by their anatomical
// angles, not by straight lines in space, so a hand turning at the wrist
// sweeps the point round an arc, and nothing passes outside a joint's limits.
// What the motion cannot know (that a disengage goes under the blade) is told
// to it with a "motion only" step in between.

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ease in and out, so each move starts and stops gently. */
export function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function tweenPose(a: Pose, b: Pose, t: number): Pose {
  const joints: Pose['joints'] = {};
  for (const name of JOINT_NAMES) {
    const from = a.joints[name] ?? {};
    const to = b.joints[name] ?? {};
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    if (!keys.size) continue;
    const out: JointAngles = {};
    for (const k of keys) out[k] = lerp(from[k] ?? 0, to[k] ?? 0, t);
    joints[name] = out;
  }
  return {
    root: { x: lerp(a.root.x, b.root.x, t), z: lerp(a.root.z, b.root.z, t), lift: lerp(a.root.lift, b.root.lift, t) },
    joints,
  };
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function tweenCamera(a: StepCamera | undefined, b: StepCamera | undefined, t: number): StepCamera | undefined {
  if (!a || !b) return b ?? a;
  return { position: lerp3(a.position, b.position, t), target: lerp3(a.target, b.target, t) };
}

export const DEFAULT_STEP_MS = 1000;

/** How long the move into this step takes when playing smoothly. */
export function stepDuration(step: Step): number {
  return step.durationMs ?? DEFAULT_STEP_MS;
}
