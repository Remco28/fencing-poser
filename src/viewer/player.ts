import type { Combination, FencerId, Pin, Step, StepCamera } from '../model/combination.ts';
import { clampDof, type JointName } from '../model/joints.ts';
import { curvePose, ease, stepDuration, tweenCamera, tweenPose } from '../model/tween.ts';
import type { Pose } from '../model/types.ts';

// Playback runs along a position measured in steps: 2 is exactly step 3,
// 2.5 is halfway from step 3 to step 4. A movement can be bent (see Step.pins);
// older "motion only" steps take part in smooth playback but are never stopped at.

const EPS = 1e-6;

/** The steps a student stops at: every step that is not motion only. */
export function keySteps(c: Combination): number[] {
  const keys = c.steps.flatMap((s, i) => (s.motionOnly ? [] : [i]));
  return keys.length ? keys : [0];
}

export interface Frame {
  poses: Record<FencerId, Pose>;
  camera?: StepCamera;
}

export function frameAt(c: Combination, pos: number): Frame {
  const i = Math.min(Math.floor(pos + EPS), c.steps.length - 1);
  const t = pos - i;
  const a = c.steps[i];
  const b = c.steps[i + 1];
  if (!b || t < EPS) return { poses: a.poses, camera: a.camera };
  const k = ease(t);
  const move = (f: FencerId) => {
    const via = b.via?.[f];
    const natural = via ? curvePose(a.poses[f], via, b.poses[f], k) : tweenPose(a.poses[f], b.poses[f], k);
    return bent(natural, pinsOf(b, f), k);
  };
  return {
    poses: { A: move('A'), B: move('B') },
    camera: tweenCamera(a.camera, b.camera, k),
  };
}

/** The key step being shown: the last one at or before `pos`. */
export function keyAt(c: Combination, pos: number): number {
  const keys = keySteps(c);
  return [...keys].reverse().find((k) => k <= pos + EPS) ?? keys[0];
}

export function nextKey(c: Combination, pos: number): number | undefined {
  return keySteps(c).find((k) => k > pos + EPS);
}

export function prevKey(c: Combination, pos: number): number | undefined {
  return [...keySteps(c)].reverse().find((k) => k < pos - EPS);
}

/** Move `pos` forward by `ms` of playback time, stopping at `stopAt`. */
export function advance(c: Combination, pos: number, ms: number, stopAt: number): number {
  let remaining = ms;
  let p = pos;
  while (remaining > 0 && p < stopAt - EPS) {
    const i = Math.floor(p + EPS);
    const duration = stepDuration(c.steps[i + 1]);
    const left = (i + 1 - p) * duration;
    if (remaining >= left) {
      p = i + 1;
      remaining -= left;
    } else {
      p += remaining / duration;
      remaining = 0;
    }
  }
  return Math.min(p, stopAt);
}

/** The pins bending a fencer's movement into `step`, in order; an older single bend is a pin halfway. */
export function pinsOf(step: Step, f: FencerId): Pin[] {
  const pins = step.pins?.[f];
  if (pins?.length) return [...pins].sort((p, q) => p.at - q.at);
  const bend = step.bend?.[f];
  return bend ? [{ at: 0.5, joints: bend }] : [];
}

/**
 * A smooth curve through (0, 0), each knot, and (1, 0): a cubic Hermite
 * spline with Catmull-Rom slopes and parabolic ends. One knot halfway gives
 * the parabola 4k(1-k), so a single pin eases in and out symmetrically.
 */
export function throughKnots(knots: [number, number][], x: number): number {
  const pts: [number, number][] = [[0, 0], ...knots, [1, 0]];
  const n = pts.length;
  if (n === 2) return 0;
  const secant = (i: number) => (pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]);
  const m = pts.map((_, i) => (i === 0 || i === n - 1 ? 0 : (pts[i + 1][1] - pts[i - 1][1]) / (pts[i + 1][0] - pts[i - 1][0])));
  m[0] = 2 * secant(0) - m[1];
  m[n - 1] = 2 * secant(n - 2) - m[n - 2];
  let i = 0;
  while (i < n - 2 && x > pts[i + 1][0]) i++;
  const h = pts[i + 1][0] - pts[i][0];
  const u = (x - pts[i][0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * pts[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * pts[i + 1][1] + (u3 - u2) * h * m[i + 1]
  );
}

/** The pose with a movement's pins added, `k` (eased) of the way through it. */
export function bent(pose: Pose, pins: Pin[], k: number): Pose {
  if (!pins.length || k <= 0 || k >= 1) return pose;
  const xs = pins.map((p) => ease(p.at));
  const joints = { ...pose.joints };
  const dofs = new Map<JointName, Set<string>>();
  for (const p of pins)
    for (const [name, deltas] of Object.entries(p.joints) as [JointName, Record<string, number>][])
      for (const dof of Object.keys(deltas)) dofs.set(name, (dofs.get(name) ?? new Set()).add(dof));
  for (const [name, keys] of dofs) {
    const out = { ...joints[name] };
    for (const dof of keys) {
      const d = throughKnots(
        pins.map((p, i) => [xs[i], p.joints[name]?.[dof] ?? 0]),
        k,
      );
      out[dof] = clampDof(name, dof, (out[dof] ?? 0) + d);
    }
    joints[name] = out;
  }
  return { ...pose, joints };
}
