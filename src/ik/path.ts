import type { Vector3 } from 'three';
import type { Combination, FencerId } from '../model/combination.ts';
import { tweenPose } from '../model/tween.ts';
import type { Pose } from '../model/types.ts';
import { solveRig } from '../rig/kinematics.ts';
import { HEADING } from '../model/combination.ts';
import { pointTo } from './blades.ts';

// Shaping a movement: the coach drags the middle of a point's path, and the
// arm's halfway pose is worked out so the point passes there. The poses at
// both ends of the movement never change.

/** Where a fencer's point is halfway through the movement into step `to`, as it plays now. */
export function pathMiddle(c: Combination, to: number, f: FencerId, frameAt: (pos: number) => { poses: Record<FencerId, Pose> }): Vector3 {
  return solveRig(c.fencers[f], frameAt(to - 0.5).poses[f], HEADING[f]).tip;
}

/** The halfway pose that sends `f`'s point through `target` on the way into step `to`. */
export function shapePath(c: Combination, to: number, f: FencerId, target: Vector3): Pose {
  const a = c.steps[to - 1].poses[f];
  const b = c.steps[to].poses[f];
  // Start from the plain halfway pose; only the arm moves to steer the point.
  return pointTo(c, f, tweenPose(a, b, 0.5), target).pose;
}
