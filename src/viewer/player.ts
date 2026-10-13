import type { Combination, FencerId, StepCamera } from '../model/combination.ts';
import { curvePose, ease, stepDuration, tweenCamera, tweenPose } from '../model/tween.ts';
import type { Pose } from '../model/types.ts';

// Playback runs along a position measured in steps: 2 is exactly step 3,
// 2.5 is halfway from step 3 to step 4. Via ("motion only") steps take part in
// smooth playback but are never stopped at.

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
    return via ? curvePose(a.poses[f], via, b.poses[f], k) : tweenPose(a.poses[f], b.poses[f], k);
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
