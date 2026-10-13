import { Matrix3, type Vector3 } from 'three';
import { HEADING, type Combination, type FencerId, type Pin } from '../model/combination.ts';
import { clampDof, JOINT_NAMES, type JointName } from '../model/joints.ts';
import { curvePose, ease, tweenPose } from '../model/tween.ts';
import { angle, type Pose } from '../model/types.ts';
import { solveRig } from '../rig/kinematics.ts';
import { frameAt } from '../viewer/player.ts';
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

/** How far an arm moved from `a` to `b`: the sum of every joint's turn, in degrees. */
function armChange(a: Pose, b: Pose): number {
  let sum = 0;
  for (const name of JOINT_NAMES)
    for (const dof of new Set([...Object.keys(a.joints[name] ?? {}), ...Object.keys(b.joints[name] ?? {})]))
      sum += Math.abs(angle(b, name, dof) - angle(a, name, dof));
  return sum;
}

/** The weapon arm's movements a pin may change, and how freely (turning the hand over costs more). */
function armDofs(c: Combination, f: FencerId): { joint: JointName; dof: string; weight: number }[] {
  const s = c.fencers[f].handedness === 'right' ? 'r' : 'l';
  return [
    { joint: `shoulder_${s}`, dof: 'flex', weight: 1 },
    { joint: `shoulder_${s}`, dof: 'abduct', weight: 1 },
    { joint: `shoulder_${s}`, dof: 'twist', weight: 0.7 },
    { joint: `elbow_${s}`, dof: 'flex', weight: 1 },
    { joint: `wrist_${s}`, dof: 'flex', weight: 1 },
    { joint: `wrist_${s}`, dof: 'deviate', weight: 1 },
    { joint: `wrist_${s}`, dof: 'pronate', weight: 0.4 },
  ] as { joint: JointName; dof: string; weight: number }[];
}

/**
 * Nudge the arm toward `target` in small steps, each the smallest turn of
 * the joints that moves the point the right way (damped least squares). It
 * never jumps to a different way of reaching, so neighbouring pins agree.
 */
function nudgeToward(c: Combination, f: FencerId, from: Pose, target: Vector3): { pose: Pose; miss: number } {
  const dofs = armDofs(c, f);
  const tip = (p: Pose) => solveRig(c.fencers[f], p, HEADING[f]).tip;
  const set = (p: Pose, i: number, v: number): Pose => {
    const { joint, dof } = dofs[i];
    return { ...p, joints: { ...p.joints, [joint]: { ...p.joints[joint], [dof]: clampDof(joint, dof, v) } } };
  };
  let pose = from;
  let at = tip(pose);
  const H = 0.5; // degrees, for the slopes
  const DAMP = 0.02;
  for (let iter = 0; iter < 40; iter++) {
    const err = target.clone().sub(at);
    if (err.length() < 0.002) break;
    // Cap each step so the arm moves a few centimetres at a time.
    if (err.length() > 0.05) err.setLength(0.05);
    const cols = dofs.map((d, i) => tip(set(pose, i, angle(pose, d.joint, d.dof) + H)).sub(at).multiplyScalar(d.weight / H));
    // (J Jᵀ + λ²I)⁻¹ err, then Jᵀ times that.
    const m = new Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const e = m.elements;
    for (const col of cols) {
      const v = col.toArray();
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) e[k * 3 + r] += v[r] * v[k];
    }
    for (let r = 0; r < 3; r++) e[r * 4] += DAMP * DAMP;
    const y = err.clone().applyMatrix3(m.invert());
    let next = pose;
    cols.forEach((col, i) => {
      const d = dofs[i];
      next = set(next, i, angle(next, d.joint, d.dof) + col.dot(y) * d.weight);
    });
    const nextAt = tip(next);
    if (nextAt.distanceTo(target) >= at.distanceTo(target) - 1e-5) break;
    pose = next;
    at = nextAt;
  }
  return { pose, miss: at.distanceTo(target) };
}

/**
 * Bring the point to `target` from the arm `from`, the way that turns the
 * arm least. An arm can reach most places several ways (the shoulder turned
 * in and the wrist one way, or out and the other); a pin that picked a
 * different way from its neighbour sent the point far off the route between
 * them. So it tries both reaching in one go and walking there in quarters
 * (each from the last, which keeps to the same way), and of those that
 * arrive keeps the smallest change. If none arrives (out of reach), the
 * closest wins, so a far drag bends as far as it can.
 */
function reachToward(c: Combination, f: FencerId, from: Pose, target: Vector3): Pose {
  const smooth = nudgeToward(c, f, from, target);
  if (smooth.miss < 0.01) return smooth.pose;
  const start = solveRig(c.fencers[f], from, HEADING[f]).tip;
  const tries = [smooth, pointTo(c, f, from, target)];
  let p = from;
  for (const k of [0.25, 0.5, 0.75, 1]) {
    p = pointTo(c, f, p, start.clone().lerp(target, k)).pose;
    tries.push({ pose: p, miss: solveRig(c.fencers[f], p, HEADING[f]).tip.distanceTo(target) });
  }
  const arrived = tries.filter((t) => t.miss < 0.01);
  if (arrived.length) return arrived.reduce((a, b) => (armChange(from, b.pose) < armChange(from, a.pose) ? b : a)).pose;
  return tries.reduce((a, b) => (b.miss < a.miss ? b : a)).pose;
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
  // Start from the arm as the movement has it there now (with any other
  // pins), so the answer is the nearest arm to the path as it is: starting
  // from the plain movement, the arm could find a quite different way to
  // reach (the wrist turned one way at one pin, the other at the next), and
  // between two such pins the point swung far off the route.
  const now = frameAt(c, to - 1 + at).poses[f];
  const solved = reachToward(c, f, now, target);
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
