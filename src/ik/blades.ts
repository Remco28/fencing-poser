import { Matrix4, Vector3 } from 'three';
import { HEADING, type Combination, type FencerId, type TargetArea } from '../model/combination.ts';
import type { Pose } from '../model/types.ts';
import { jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';
import { aim, reach } from './ik.ts';

// Blade contact. Blades are segments from the guard to the point. Moving one
// fencer's blade into the other's pushes the other aside (its wrist turns)
// instead of passing through; the helpers engage the blades in a line and
// bring a point onto a target. Arms and bodies are not pushed: they bend in
// too many ways to guess well.

/** How far apart the centre lines of two touching blades are, in metres. */
export const CONTACT = 0.012;

type Poses = Record<FencerId, Pose>;
const other = (f: FencerId): FencerId => (f === 'A' ? 'B' : 'A');

function rig(c: Combination, poses: Poses, f: FencerId): Rig {
  return solveRig(c.fencers[f], poses[f], HEADING[f]);
}

/** Closest points between segments p1–q1 and p2–q2, with their positions along each (0–1). */
export function closestBetween(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3) {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const c = d1.dot(r);
  const b = d1.dot(d2);
  const denom = a * e - b * b;
  let s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (b - c) / a));
  }
  const c1 = p1.clone().addScaledVector(d1, s);
  const c2 = p2.clone().addScaledVector(d2, t);
  return { s, t, c1, c2, distance: c1.distanceTo(c2) };
}

const weaponWrist = (c: Combination, f: FencerId) => (c.fencers[f].handedness === 'right' ? 'wrist_r' : 'wrist_l');

/** Turn a fencer's blade about their wrist so the point on it at `along` (0–1) moves to `to`. */
function swingBlade(c: Combination, poses: Poses, f: FencerId, along: number, to: Vector3): Pose {
  const r = rig(c, poses, f);
  const wrist = jointPosition(r, weaponWrist(c, f));
  // The blade runs (nearly) through the wrist, so pointing it from the wrist
  // through `to` moves the point at `along` there.
  void along;
  const tipTarget = wrist.clone().addScaledVector(to.clone().sub(wrist).normalize(), r.tip.distanceTo(wrist));
  return aim(poses[f], (p) => solveRig(c.fencers[f], p, HEADING[f]), c.fencers[f], tipTarget);
}

/**
 * After `mover` has moved (from `before` to `after`), keep the blades from
 * passing through each other: if they now cross or overlap, the other
 * fencer's blade is swung aside to the side it was on before.
 */
export function pushBlades(c: Combination, before: Poses, after: Poses, mover: FencerId): Poses {
  const still = other(mover);
  const a0 = rig(c, before, mover);
  const a1 = rig(c, after, mover);
  const b = rig(c, after, still);
  const n = a1.tip.clone().sub(a1.guard).cross(b.tip.clone().sub(b.guard));
  if (n.lengthSq() < 1e-10) return after;
  n.normalize();
  const was = closestBetween(a0.guard, a0.tip, b.guard, b.tip);
  const now = closestBetween(a1.guard, a1.tip, b.guard, b.tip);
  const interior = (x: number) => x > 0.02 && x < 0.98;
  if (!interior(now.s) || !interior(now.t)) return after;
  const sideBefore = Math.sign(was.c2.clone().sub(was.c1).dot(n)) || 1;
  const offsetNow = now.c2.clone().sub(now.c1).dot(n);
  const passedThrough = Math.sign(offsetNow) !== sideBefore && was.distance < 0.25;
  if (!passedThrough && Math.abs(offsetNow) >= CONTACT) return after;
  // Move the other blade's contact point out to just touching, on its old side.
  const target = now.c2.clone().addScaledVector(n, sideBefore * CONTACT - offsetNow);
  return { ...after, [still]: swingBlade(c, after, still, now.t, target) };
}

/** Which way is a fencer's outside (their weapon-hand side), horizontally. */
function outside(c: Combination, f: FencerId): Vector3 {
  const right = new Vector3(0, 0, 1).applyMatrix4(new Matrix4().makeRotationY((HEADING[f] * Math.PI) / 180));
  return c.fencers[f].handedness === 'right' ? right : right.negate();
}

/**
 * Engage the blades: `mover` lays their blade against the opponent's, on the
 * mover's outside (sixte) or inside (quarte), around the middle of the
 * opponent's blade.
 */
export function engage(c: Combination, poses: Poses, mover: FencerId, line: 'sixte' | 'quarte'): Poses {
  const opp = rig(c, poses, other(mover));
  const contact = opp.guard.clone().lerp(opp.tip, 0.62);
  const side = outside(c, mover).multiplyScalar(line === 'sixte' ? 1 : -1);
  const through = contact.addScaledVector(side, CONTACT);
  const r = rig(c, poses, mover);
  const wrist = jointPosition(r, weaponWrist(c, mover));
  // Aim so the blade passes through the contact point, at full length.
  const tipTarget = wrist.clone().addScaledVector(through.sub(wrist).normalize(), r.tip.distanceTo(wrist));
  const pose = aim(poses[mover], (p) => solveRig(c.fencers[mover], p, HEADING[mover]), c.fencers[mover], tipTarget);
  return { ...poses, [mover]: pose };
}

/** A point on the surface of a target area, on the side facing `from`. */
export function targetPoint(r: Rig, area: TargetArea, weaponSide: 'r' | 'l', from: Vector3): Vector3 {
  const H = r.layout.height;
  const at = (j: Parameters<typeof jointPosition>[1], local: [number, number, number]) =>
    new Vector3(...local).applyMatrix4(r.world[j]);
  const mid = (j1: Parameters<typeof jointPosition>[1], j2: Parameters<typeof jointPosition>[1]) =>
    jointPosition(r, j1).lerp(jointPosition(r, j2), 0.5);
  const w = weaponSide;
  const [center, radius] = ((): [Vector3, number] => {
    switch (area) {
      case 'mask':
        return [at('neck', [0.008 * H, 0.088 * H, 0]), 0.06 * H];
      case 'body':
        return [at('chest', [0, 0.06 * H, 0]), 0.08 * H];
      case 'arm':
        return [mid(`elbow_${w}`, `wrist_${w}`), 0.026 * H];
      case 'hand':
        return [at(`wrist_${w}`, [0, -0.03 * H, 0]), 0.025 * H];
      case 'leg':
        return [mid(`hip_${w}`, `knee_${w}`), 0.045 * H];
      case 'foot':
        return [at(`ankle_${w}`, [0.05 * H, -0.02 * H, 0]), 0.025 * H];
    }
  })();
  return center.clone().add(from.clone().sub(center).setLength(radius));
}

/**
 * Bring `mover`'s point onto a target on the opponent: the arm reaches and the
 * hand aims. Returns the new poses and how far short the point still is (0
 * when it lands); a distant target needs a step or a lunge first.
 */
export function touch(c: Combination, poses: Poses, mover: FencerId, area: TargetArea): { poses: Poses; short: number } {
  const opp = other(mover);
  const r = rig(c, poses, mover);
  const side = c.fencers[opp].handedness === 'right' ? 'r' : 'l';
  const target = targetPoint(rig(c, poses, opp), area, side, r.tip);
  const wristName = weaponWrist(c, mover);
  const build = (p: Pose) => solveRig(c.fencers[mover], p, HEADING[mover]);
  const wrist = jointPosition(r, wristName);
  const armSide = wristName === 'wrist_r' ? 'r' : 'l';
  const reachToTip = r.tip.distanceTo(wrist);
  // Reach and aim pull on each other (aiming changes where the hand must be),
  // so alternate them a few times; the point settles on the target.
  const attempt = (wristTarget: Vector3) => {
    let p = poses[mover];
    let goal = wristTarget;
    for (let i = 0; i < 6; i++) {
      p = aim(reach(p, build, 'arm', armSide, goal), build, c.fencers[mover], target);
      const now = build(p);
      goal = target.clone().sub(now.tip.clone().sub(jointPosition(now, wristName)));
    }
    return { pose: p, miss: build(p).tip.distanceTo(target) };
  };
  // First keep the blade's angle and carry the hand; if that cannot land,
  // put arm and blade in one line from the shoulder, as in a direct thrust.
  const kept = attempt(target.clone().sub(r.tip.clone().sub(wrist)));
  const shoulder = jointPosition(r, `shoulder_${armSide}`);
  const line = attempt(target.clone().sub(target.clone().sub(shoulder).setLength(reachToTip)));
  const best = kept.miss <= line.miss ? kept : line;
  return { poses: { ...poses, [mover]: best.pose }, short: best.miss < 0.02 ? 0 : best.miss };
}
