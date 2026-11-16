import { Line3, Matrix4, Vector3 } from 'three';
import { HEADING, type Combination, type FencerId, type TargetArea } from '../model/combination.ts';
import { clampDof } from '../model/joints.ts';
import type { Pose } from '../model/types.ts';
import { balanceOf } from '../rig/balance.ts';
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
export function swingBlade(c: Combination, poses: Poses, f: FencerId, along: number, to: Vector3): Pose {
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
export function outsideOf(c: Combination, f: FencerId): Vector3 {
  const right = new Vector3(0, 0, 1).applyMatrix4(new Matrix4().makeRotationY((HEADING[f] * Math.PI) / 180));
  return c.fencers[f].handedness === 'right' ? right : right.negate();
}

/**
 * Lay `yielder`'s blade against `holder`'s, which stays as it is: the
 * yielder's blade ends up touching the holder's on the `side` given (a
 * horizontal direction: the yielder's blade lies that way from the holder's
 * where they touch). The wrist does it if it can; otherwise the hand may
 * move a little as well (`handMay`, metres). `prefer` says where on the
 * holder's blade they should meet: its forte (near the guard, as in a parry:
 * strong against weak) or its foible (near the point, as when it is beaten).
 *
 * Returns null when the blades cannot be brought together: too far apart,
 * or only by twisting the yielder's arm out of all recognition (a low parry
 * chosen against a high attack simply does not find the blade).
 */
export function layAgainst(
  c: Combination,
  poses: Poses,
  holder: FencerId,
  side: Vector3,
  prefer: 'forte' | 'foible',
  /** Only meet within this much of the holder's blade, from the guard (0) to the point (1). */
  within = 0.9,
  handMay = 0.08,
): Poses | null {
  const yielder = other(holder);
  const h = rig(c, poses, holder);
  const setup = c.fencers[yielder];
  const build = (p: Pose) => solveRig(setup, p, HEADING[yielder]);
  const wristName = weaponWrist(c, yielder);
  const armSide = wristName === 'wrist_r' ? 'r' : 'l';
  const from = poses[yielder];
  const start = build(from);
  const wrist0 = jointPosition(start, wristName);
  const length = start.tip.distanceTo(wrist0);
  const offset = side.clone().setLength(CONTACT);

  /** How far the yielder's blade is from passing through `through`, and where on it that is. */
  const missOf = (p: Pose, through: Vector3) => {
    const r = build(p);
    const on = new Line3(r.guard, r.tip).closestPointToPoint(through, true, new Vector3());
    return { miss: on.distanceTo(through), on, wrist: jointPosition(r, wristName) };
  };
  const aimThrough = (p: Pose, through: Vector3) => {
    const wrist = jointPosition(build(p), wristName);
    return aim(p, build, setup, wrist.clone().addScaledVector(through.clone().sub(wrist).normalize(), length));
  };

  // Places along the holder's blade, the preferred end first. The first one
  // the wrist alone can manage wins; failing that, the nearest miss.
  const places = Array.from({ length: 16 }, (_, i) => 0.15 + i * 0.05).filter((p) => p <= within + 1e-9);
  if (prefer === 'foible') places.reverse();
  let best: { pose: Pose; miss: number; through: Vector3 } | null = null;
  for (const along of places) {
    const through = h.guard.clone().lerp(h.tip, along).add(offset);
    if (through.distanceTo(wrist0) > length * 0.97) continue;
    const pose = aimThrough(from, through);
    const { miss } = missOf(pose, through);
    if (!best || miss < best.miss) best = { pose, miss, through };
    if (miss < 0.004) break;
  }
  if (!best) return null;

  // The wrist alone could not: carry the hand across by what is missing, a little.
  for (let i = 0; i < 3 && best.miss >= 0.004; i++) {
    const { on, wrist } = missOf(best.pose, best.through);
    const goal = wrist.clone().add(best.through.clone().sub(on));
    if (goal.distanceTo(wrist0) > handMay) goal.sub(wrist0).setLength(handMay).add(wrist0);
    const pose = aimThrough(reach(best.pose, build, 'arm', armSide, goal), best.through);
    const { miss } = missOf(pose, best.through);
    if (miss >= best.miss) break;
    best = { pose, miss, through: best.through };
  }
  return best.miss < 0.015 ? { ...poses, [yielder]: best.pose } : null;
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
/**
 * Move a fencer's arm (reach, then aim; alternated, since each moves the
 * other) so the point lands on `target`, keeping the body as it is.
 */
export function pointTo(
  c: Combination,
  f: FencerId,
  pose: Pose,
  target: Vector3,
  /** Playback passes false: one consistent way of reaching, so frames cannot flip between two answers. */
  lineFallback = true,
): { pose: Pose; miss: number } {
  const wristName = weaponWrist(c, f);
  const armSide = wristName === 'wrist_r' ? 'r' : 'l';
  const build = (p: Pose) => solveRig(c.fencers[f], p, HEADING[f]);
  // Reach and aim pull on each other and can chase rather than settle, so
  // keep the best attempt, not the last.
  const settle = (wristGoal: Vector3) => {
    let p = pose;
    let goal = wristGoal;
    let best = { pose, miss: build(pose).tip.distanceTo(target) };
    for (let i = 0; i < 8; i++) {
      p = aim(reach(p, build, 'arm', armSide, goal), build, c.fencers[f], target);
      const now = build(p);
      const miss = now.tip.distanceTo(target);
      if (miss < best.miss) best = { pose: p, miss };
      if (miss < 0.003) break;
      goal = target.clone().sub(now.tip.clone().sub(jointPosition(now, wristName)));
    }
    return best;
  };
  const r = build(pose);
  const wrist = jointPosition(r, wristName);
  // First keep the blade's angle and carry the hand there.
  const kept = settle(target.clone().sub(r.tip.clone().sub(wrist)));
  if (kept.miss < 0.01 || !lineFallback) return kept;
  // Otherwise try arm and blade in one line from the shoulder.
  const shoulder = jointPosition(r, `shoulder_${armSide}`);
  const line = settle(target.clone().sub(target.clone().sub(shoulder).setLength(r.tip.distanceTo(wrist))));
  return line.miss < kept.miss ? line : kept;
}

/** A point this near its target has landed, metres. */
const LANDS = 0.01;

/**
 * How the hand may sit for a folded arm, as turns of the blade away from the
 * straight line from shoulder to target, in degrees: [hand lower (+) or
 * higher (-), hand to the outside (+) or inside (-)]. Least bent first.
 */
const FOLDS: [number, number][] = [
  [20, 0], [0, 20], [-20, 0], [0, -20], [20, 20], [20, -20], [-20, 20],
  [40, 0], [0, 40], [40, 20], [20, 40], [-40, 0], [0, -40], [40, -20], [-20, 40],
  [60, 0], [40, 40], [60, 20], [60, -20], [0, 60], [60, 40], [75, 0], [75, 30],
];

/**
 * Every way the weapon arm is tried to put the point on `target`, with the
 * body as it is:
 * 1. the blade kept at its angle and the hand carried there;
 * 2. arm and blade in one line from the shoulder, a direct thrust;
 * 3. for a target that is in reach but nearer than those manage, the arm
 *    folded: the hand placed a blade's length from the target, somewhere the
 *    arm can get to, lower, higher or to one side of the straight line, tried
 *    from the least bent to the most, and if the shoulder cannot do that with
 *    the elbow as it points, with the elbow down or out.
 * The first that lands wins; if none does, the nearest.
 */
export function armTo(c: Combination, f: FencerId, body: Pose, target: Vector3): { pose: Pose; miss: number } {
  const setup = c.fencers[f];
  const wristName = weaponWrist(c, f);
  const armSide = wristName === 'wrist_r' ? 'r' : 'l';
  const build = (p: Pose) => solveRig(setup, p, HEADING[f]);
  const r = build(body);
  // Reach and aim pull on each other (aiming changes where the hand must
  // be), so alternate them a few times and keep the best, not the last.
  const settle = (wristGoal: Vector3, pole?: Vector3) => {
    let p = body;
    let goal = wristGoal;
    let best = { pose: body, miss: r.tip.distanceTo(target) };
    for (let i = 0; i < 6; i++) {
      p = aim(reach(p, build, 'arm', armSide, goal, pole), build, setup, target);
      const now = build(p);
      const miss = now.tip.distanceTo(target);
      if (miss < best.miss) best = { pose: p, miss };
      if (miss < 0.003) break;
      goal = target.clone().sub(now.tip.clone().sub(jointPosition(now, wristName)));
    }
    return best;
  };
  const wrist = jointPosition(r, wristName);
  const shoulder = jointPosition(r, `shoulder_${armSide}`);
  const blade = r.tip.distanceTo(wrist);

  let best = settle(target.clone().sub(r.tip.clone().sub(wrist)));
  if (best.miss < LANDS) return best;
  const line = settle(target.clone().sub(target.clone().sub(shoulder).setLength(blade)));
  if (line.miss < best.miss) best = line;
  if (best.miss < LANDS) return best;

  // Folded. No fold helps a target further than arm and blade together.
  const arm = r.layout.upperArm + r.layout.forearm;
  const toTarget = target.clone().sub(shoulder);
  if (toTarget.length() > arm + blade) return best;
  const along = toTarget.clone().normalize();
  const up = new Vector3(0, 1, 0);
  const across = new Vector3().crossVectors(along, up);
  if (across.lengthSq() < 1e-6) return best;
  across.normalize();
  const out = outsideOf(c, f);
  // Which way round `up` turns the blade so the hand goes to the fencer's outside.
  const outward = Math.sign(new Vector3().crossVectors(up, along).dot(out)) || 1;
  const hands = FOLDS.map(([lower, outside]) => {
    // The blade's direction, hand to target: tipped up puts the hand lower, turned away from `out` puts it outside.
    const dir = along.clone().applyAxisAngle(across, (lower * Math.PI) / 180).applyAxisAngle(up, (-outward * outside * Math.PI) / 180);
    return target.clone().addScaledVector(dir, -blade);
  }).filter((hand) => hand.distanceTo(shoulder) < arm - 0.005);
  const down = new Vector3(0, -1, 0);
  for (const pole of [undefined, down.clone().add(out), down, out]) {
    for (const hand of hands) {
      const tried = settle(hand, pole);
      if (tried.miss < best.miss) best = tried;
      if (best.miss < LANDS) return best;
    }
  }
  return best;
}

/** Leaning in for a touch: how far each part of the body can bend toward the target, at full lean. */
const FULL_LEAN = { pelvis: 18, abdomen: 12, chest: 12 };
const LEAN_STEPS = [0.25, 0.5, 0.75, 1];

function leaned(pose: Pose, k: number): Pose {
  const add = (joint: 'pelvis' | 'abdomen' | 'chest', dof: string, deg: number) => ({
    ...pose.joints[joint],
    [dof]: clampDof(joint, dof, (pose.joints[joint]?.[dof] ?? 0) + deg * k),
  });
  return {
    ...pose,
    joints: {
      ...pose.joints,
      pelvis: add('pelvis', 'lean', FULL_LEAN.pelvis),
      abdomen: add('abdomen', 'flex', FULL_LEAN.abdomen),
      chest: add('chest', 'flex', FULL_LEAN.chest),
    },
  };
}

/**
 * Bring `mover`'s point onto a target on the opponent: the arm reaches and the
 * hand aims (every way `armTo` knows, a folded arm included for a near
 * target); if the arm alone falls short, the body leans in, step by step,
 * but never so far that the fencer would be off balance. Returns the new
 * poses and how far short the point still is (0 when it lands); a distant
 * target needs a step or a lunge first.
 */
export function touch(c: Combination, poses: Poses, mover: FencerId, area: TargetArea): { poses: Poses; short: number } {
  const opp = other(mover);
  const side = c.fencers[opp].handedness === 'right' ? 'r' : 'l';
  const target = targetPoint(rig(c, poses, opp), area, side, rig(c, poses, mover).tip);
  const build = (p: Pose) => solveRig(c.fencers[mover], p, HEADING[mover]);
  const fromBody = (body: Pose) => armTo(c, mover, body, target);

  let best = fromBody(poses[mover]);
  for (const k of LEAN_STEPS) {
    if (best.miss < 0.02) break;
    const tried = fromBody(leaned(poses[mover], k));
    if (balanceOf(build(tried.pose)).outside > 0) break;
    if (tried.miss < best.miss) best = tried;
  }
  return { poses: { ...poses, [mover]: best.pose }, short: best.miss < 0.02 ? 0 : best.miss };
}
