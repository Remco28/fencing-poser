import type { Vector3 } from 'three';
import { HEADING, type Combination, type FencerId, type Pin } from '../model/combination.ts';
import { JOINT_NAMES } from '../model/joints.ts';
import { curvePose, ease, tweenPose } from '../model/tween.ts';
import { angle, type Pose } from '../model/types.ts';
import { solveRig } from '../rig/kinematics.ts';
import { pointTo } from './blades.ts';

// Shaping a movement: the coach drags the point's path, pinning it in up to
// three places. The arm is solved once at each pin, and playback eases those
// changes to the arm smoothly across the movement. Joint angles then change
// smoothly every frame, so the point glides (solving the arm afresh each
// frame, or blending through a whole halfway pose, made it leap). Both steps
// keep their poses.

/** At most this many pins per fencer per movement: enough for an angle or an S, few enough to stay smooth. */
export const MAX_PINS = 3;

/** Where a fencer's point is `at` (0 to 1) through the movement into step `to`, as it plays now. */
export function pathPoint(
  c: Combination,
  to: number,
  f: FencerId,
  at: number,
  frameAt: (pos: number) => { poses: Record<FencerId, Pose> },
): Vector3 {
  return solveRig(c.fencers[f], frameAt(to - 1 + at).poses[f], HEADING[f]).tip;
}

/** `at` through the movement into step `to`, with no pins. */
function natural(c: Combination, to: number, f: FencerId, at: number): Pose {
  const a = c.steps[to - 1].poses[f];
  const b = c.steps[to].poses[f];
  const via = c.steps[to].via?.[f];
  const k = ease(at);
  return via ? curvePose(a, via, b, k) : tweenPose(a, b, k);
}

/**
 * Solve for `target`; if the arm cannot get there in one go (it can stall
 * against a joint's limit), walk it there in quarters, each from the last,
 * and keep whichever came closest, so a far drag bends as far as it can.
 */
function reachToward(c: Combination, f: FencerId, plain: Pose, target: Vector3): Pose {
  const direct = pointTo(c, f, plain, target);
  if (direct.miss < 0.01) return direct.pose;
  const start = solveRig(c.fencers[f], plain, HEADING[f]).tip;
  let best = direct;
  let p = plain;
  for (const k of [0.25, 0.5, 0.75, 1]) {
    p = pointTo(c, f, p, start.clone().lerp(target, k)).pose;
    const miss = solveRig(c.fencers[f], p, HEADING[f]).tip.distanceTo(target);
    if (miss < best.miss) best = { pose: p, miss };
  }
  return best.pose;
}

/**
 * The pin that sends `f`'s point through `target`, `at` of the way into
 * step `to` (or as near as the arm can reach): the arm is solved once, there,
 * and the pin keeps how far each joint turned from the plain movement. The
 * spline through the pins passes exactly through each, so other pins do not
 * change where this one sends the point.
 */
export function pinFor(c: Combination, to: number, f: FencerId, target: Vector3, at = 0.5): Pin {
  const plain = natural(c, to, f, at);
  const solved = reachToward(c, f, plain, target);
  const joints: Pose['joints'] = {};
  for (const name of JOINT_NAMES) {
    const deltas: Record<string, number> = {};
    for (const [dof, v] of Object.entries(solved.joints[name] ?? {})) {
      const d = (v ?? 0) - angle(plain, name, dof);
      if (Math.abs(d) > 0.05) deltas[dof] = d;
    }
    if (Object.keys(deltas).length) joints[name] = deltas;
  }
  return { at, joints };
}
