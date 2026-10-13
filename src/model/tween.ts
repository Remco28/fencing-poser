import { clampDof, JOINT_NAMES } from './joints.ts';
import type { Step, StepCamera, Vec3 } from './combination.ts';
import type { JointAngles, Pose } from './types.ts';

// In-between frames for smooth playback. Joints move by their anatomical
// angles, not by straight lines in space, so a hand turning at the wrist
// sweeps the point round an arc, and nothing passes outside a joint's limits.
// What the motion cannot know (that a disengage goes under the blade) is told
// to it by shaping the path: a halfway pose the movement curves through.

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ease in and out, so each move starts and stops gently. */
export function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Through a halfway pose: a smooth curve (a quadratic Bézier in angle space)
 * that starts at `a`, passes through `via` exactly halfway, and ends at `b`,
 * without stopping at the middle. Joints stay inside their limits.
 */
export function curvePose(a: Pose, via: Pose, b: Pose, t: number): Pose {
  const curve = (va: number, vv: number, vb: number) => {
    const control = 2 * vv - (va + vb) / 2;
    return (1 - t) * (1 - t) * va + 2 * t * (1 - t) * control + t * t * vb;
  };
  const joints: Pose['joints'] = {};
  for (const name of JOINT_NAMES) {
    const ja = a.joints[name] ?? {};
    const jv = via.joints[name] ?? {};
    const jb = b.joints[name] ?? {};
    const keys = new Set([...Object.keys(ja), ...Object.keys(jv), ...Object.keys(jb)]);
    if (!keys.size) continue;
    const out: JointAngles = {};
    for (const k of keys) out[k] = clampDof(name, k, curve(ja[k] ?? 0, jv[k] ?? 0, jb[k] ?? 0));
    joints[name] = out;
  }
  return {
    root: {
      x: curve(a.root.x, via.root.x, b.root.x),
      z: curve(a.root.z, via.root.z, b.root.z),
      lift: Math.max(0, curve(a.root.lift, via.root.lift, b.root.lift)),
    },
    joints,
  };
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
