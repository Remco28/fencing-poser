import type { Vector3 } from 'three';
import { HEADING, type Combination, type FencerId } from '../model/combination.ts';
import { JOINT_NAMES } from '../model/joints.ts';
import { curvePose, tweenPose } from '../model/tween.ts';
import { angle, type Pose } from '../model/types.ts';
import { solveRig } from '../rig/kinematics.ts';
import { pointTo } from './blades.ts';

// Shaping a movement: the coach drags the middle of a point's path. The arm
// is solved once for that middle point, and playback fades that change to
// the arm in and out across the movement. Joint angles then change smoothly
// every frame, so the point glides (solving the arm afresh each frame, or
// blending through a whole halfway pose, made it leap). Both steps keep
// their poses.

/** Where a fencer's point is halfway through the movement into step `to`, as it plays now. */
export function pathMiddle(c: Combination, to: number, f: FencerId, frameAt: (pos: number) => { poses: Record<FencerId, Pose> }): Vector3 {
  return solveRig(c.fencers[f], frameAt(to - 0.5).poses[f], HEADING[f]).tip;
}

/** Halfway through the movement into step `to` with no bend. */
function naturalMiddle(c: Combination, to: number, f: FencerId): Pose {
  const a = c.steps[to - 1].poses[f];
  const b = c.steps[to].poses[f];
  const via = c.steps[to].via?.[f];
  return via ? curvePose(a, via, b, 0.5) : tweenPose(a, b, 0.5);
}

/**
 * The bend that sends `f`'s point through `target` halfway into step `to`
 * (or as near as the arm can reach): the arm is solved once, at the middle,
 * and the bend is how far each joint turned from the plain movement.
 */
export function bendFor(c: Combination, to: number, f: FencerId, target: Vector3): Pose['joints'] {
  const mid = naturalMiddle(c, to, f);
  const solved = pointTo(c, f, mid, target).pose;
  const bend: Pose['joints'] = {};
  for (const name of JOINT_NAMES) {
    const deltas: Record<string, number> = {};
    for (const [dof, v] of Object.entries(solved.joints[name] ?? {})) {
      const d = (v ?? 0) - angle(mid, name, dof);
      if (Math.abs(d) > 0.05) deltas[dof] = d;
    }
    if (Object.keys(deltas).length) bend[name] = deltas;
  }
  return bend;
}
