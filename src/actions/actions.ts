import { Line3, Vector3 } from 'three';
import {
  FORWARD,
  HEADING,
  TARGET_NAMES,
  type Combination,
  type FencerId,
  type Pin,
  type TargetArea,
} from '../model/combination.ts';
import type { JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { tweenPose } from '../model/tween.ts';
import type { Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS, type PresetPose } from '../presets/builtin.ts';
import { poseFromPreset } from '../presets/library.ts';
import { jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';
import { frontToe } from '../scene/measure.ts';
import { frameAt } from '../viewer/player.ts';
import { armTo, layAgainst, outsideOf, pointTo, pushBlades, swingBlade, targetPoint, touch } from '../ik/blades.ts';
import { editKept, pick, placesOf } from '../ik/drag.ts';
import { pinFor } from '../ik/path.ts';

// Named fencing actions ("A lunges", "B parries six") turned into poses, so a
// coach can build most steps of a phrase with one click instead of posing
// every joint by hand. Each action changes the mover's pose; the opponent's
// changes only through blade contact.

export type Line = 'sixte' | 'quarte';
export type ParryNumber = 1 | 2 | 3 | 4 | 6 | 7 | 8;
export type Footwork = 'advance' | 'retreat' | 'half-lunge' | 'lunge' | 'recover' | 'fleche';
export type Measure = 'short' | 'medium' | 'long';
export type HitWith = 'arm' | 'lunge' | 'fleche';
export type PathShape = 'direct' | 'under' | 'over';

export type Action =
  | { kind: 'footwork'; move: Footwork }
  | { kind: 'distance'; measure: Measure }
  | { kind: 'extend' }
  | { kind: 'parry'; number: ParryNumber }
  | { kind: 'beat'; line: Line }
  | { kind: 'engage'; line: Line }
  | { kind: 'hit'; area: TargetArea; with: HitWith };

export interface ActionResult {
  poses: Record<FencerId, Pose>;
  /** Metres the point fell short of the target (hit only); 0 or undefined when it landed. */
  short?: number;
  /** A hit that fell short because the target is too close for the blade, not too far. */
  close?: boolean;
  /** A beat or an engagement with the blades too far apart to meet: nothing was changed. */
  apart?: boolean;
  /** Footwork with the opponent in the way: it went only as far as there was room, or nowhere. */
  cramped?: Cramped;
}

/** 'short': less than asked, as far as there was room. 'blocked': no room at all, nothing was changed. */
export type Cramped = 'short' | 'blocked';

// Numbers a coach may want to tune.
/** One advance or retreat, in metres. */
export const STEP_LENGTH = 0.35;
/** How far the flèche preset carries the fencer forward, in metres. */
export const FLECHE_TRAVEL = 0.6;
/** The furthest a flèche may run to land a hit, in metres. */
export const FLECHE_MAX = 3;
/** How far a beat knocks the opponent's blade aside, where it is struck, in metres. */
export const BEAT_KNOCK = 0.1;
/** Where a beat strikes the opponent's blade, from guard (0) to point (1): the weak part. */
export const BEAT_AT = 0.65;
/** A parry takes a blade that reaches at least this near the parrying guard, along the parrying blade (0 guard, 1 point). */
export const PARRY_REACH = 0.55;
/** A disengage passes this far below the opponent's blade, in metres. */
export const UNDER_CLEARANCE = 0.12;
/** A cut-over passes this far above the opponent's point, in metres. */
export const OVER_CLEARANCE = 0.15;
/** A cut-over when the blades do not overlap: the point lifts this much, in metres. */
export const OVER_LIFT = 0.2;
/** A hit with a lunge tries these depths in turn (1 = the full lunge) and takes the first that lands. */
export const LUNGE_DEPTHS = [0.25, 0.5, 0.75, 1];
/** The run-off ends this far from the centre line (matches the editor). */
const PISTE_HALF = 8.5;

type Poses = Record<FencerId, Pose>;
const LINE_NUMBER: Record<Line, ParryNumber> = { sixte: 6, quarte: 4 };
const other = (f: FencerId): FencerId => (f === 'A' ? 'B' : 'A');
const weaponSide = (c: Combination, f: FencerId): 'r' | 'l' => (c.fencers[f].handedness === 'right' ? 'r' : 'l');
const rearSide = (c: Combination, f: FencerId): 'r' | 'l' => (weaponSide(c, f) === 'r' ? 'l' : 'r');
const rigOf = (c: Combination, f: FencerId, pose: Pose): Rig => solveRig(c.fencers[f], pose, HEADING[f]);

const TORSO: JointName[] = ['abdomen', 'chest'];
const HEAD: JointName[] = ['neck'];
const LOWER: JointName[] = ['pelvis', 'hip_r', 'knee_r', 'ankle_r', 'hip_l', 'knee_l', 'ankle_l'];
const weaponArm = (s: 'r' | 'l'): JointName[] => [`shoulder_${s}`, `elbow_${s}`, `wrist_${s}`, 'grip'];
const freeArm = (s: 'r' | 'l'): JointName[] => [`shoulder_${s}`, `elbow_${s}`, `wrist_${s}`];

function findPreset(id: string, presets: PresetPose[] | undefined): PresetPose {
  const found = presets?.find((p) => p.id === id) ?? BUILT_IN_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`No preset "${id}"`);
  return found;
}

/** A preset's joints for this fencer (mirrored for a left-hander). */
function presetJoints(c: Combination, f: FencerId, id: string, presets?: PresetPose[]): Pose['joints'] {
  const p = findPreset(id, presets).pose;
  return c.fencers[f].handedness === 'left' ? mirrorPose(p).joints : p.joints;
}

/** `pose` with the named joints taken from `from` (a joint `from` leaves out is reset). */
function take(pose: Pose, from: Pose['joints'], names: JointName[]): Pose {
  const joints = { ...pose.joints };
  for (const n of names) {
    if (from[n]) joints[n] = from[n];
    else delete joints[n];
  }
  return { ...pose, joints };
}

/** Shift `after` along and across the piste so its rear ankle stands where `before`'s did. */
function plantRear(c: Combination, f: FencerId, before: Pose, after: Pose): Pose {
  const ankle = `ankle_${rearSide(c, f)}` as const;
  const was = jointPosition(rigOf(c, f, before), ankle);
  const now = jointPosition(rigOf(c, f, after), ankle);
  const dx = was.x - now.x;
  const dz = was.z - now.z;
  // Already there (to rounding): leave the place exactly as it is, so doing it twice changes nothing.
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return after;
  return { ...after, root: { ...after.root, x: after.root.x + dx, z: after.root.z + dz } };
}

/** How far the mover's front toe is short of the opponent's, along the piste (negative: past it). */
function room(c: Combination, poses: Poses, f: FencerId, pose: Pose): number {
  const opp = other(f);
  return (frontToe(rigOf(c, opp, poses[opp]), opp).x - frontToe(rigOf(c, f, pose), f).x) * FORWARD[f];
}

/** A toe level with the opponent's still fits. */
const FITS = -1e-6;

/** Keep the mover on the piste, and their front foot no further forward than the opponent's. */
function place(c: Combination, poses: Poses, f: FencerId, pose: Pose): Pose {
  const fwd = FORWARD[f];
  let x = Math.max(-PISTE_HALF, Math.min(PISTE_HALF, pose.root.x));
  const toe = frontToe(rigOf(c, f, { ...pose, root: { ...pose.root, x } }), f).x;
  const opp = other(f);
  const oppToe = frontToe(rigOf(c, opp, poses[opp]), opp).x;
  const past = (toe - oppToe) * fwd;
  if (past > 0) x -= past * fwd;
  return { ...pose, root: { ...pose.root, x } };
}

const at = (pose: Pose, x: number): Pose => ({ ...pose, root: { ...pose.root, x } });

// Footwork -----------------------------------------------------------------

function lungePose(c: Combination, f: FencerId, pose: Pose, k: number, presets?: PresetPose[]): Pose {
  const lunge = presetJoints(c, f, 'lunge', presets);
  const guard = presetJoints(c, f, 'en-garde', presets);
  const body = [...LOWER, ...TORSO, ...freeArm(rearSide(c, f))];
  let next: Pose;
  if (k >= 1) next = take(pose, lunge, body);
  else {
    // Halfway between en garde and the lunge, for the legs, body and back arm.
    const mid = tweenPose({ root: pose.root, joints: guard }, { root: pose.root, joints: lunge }, k);
    next = take(pose, mid.joints, body);
  }
  next = take(next, lunge, weaponArm(weaponSide(c, f)));
  return plantRear(c, f, pose, next);
}

/** The deepest lunge, up to `depth` (1 = full), whose front toe does not pass the opponent's; the back foot never moves. Null if not even guard fits. */
function lungeWithin(c: Combination, poses: Poses, f: FencerId, pose: Pose, depth: number, presets?: PresetPose[]): { pose: Pose; depth: number } | null {
  for (let d = depth; d > -1e-9; d -= 0.125) {
    const p = lungePose(c, f, pose, Math.max(0, d), presets);
    if (room(c, poses, f, p) >= FITS) return { pose: p, depth: Math.max(0, d) };
  }
  return null;
}

/** The en garde legs and hips (not the arms or body) over the back foot: where footwork is measured from. */
function guardLegs(c: Combination, f: FencerId, pose: Pose, presets?: PresetPose[]): Pose {
  return plantRear(c, f, pose, take(pose, presetJoints(c, f, 'en-garde', presets), LOWER));
}

interface Stepped {
  pose: Pose;
  /** There was not room for all of it ('short'), or for any of it ('blocked': the pose is unchanged). */
  cramped?: Cramped;
}

/**
 * Footwork is measured from the back foot, wherever the hips are: a lunge
 * keeps it where it is, an advance or retreat carries it one step, a flèche
 * runs on from where en garde over it would stand. What counts is where a
 * move ENDS: none may end past the opponent's front toe, and none goes
 * backward to avoid it (a lunge becomes shallower, an advance shorter); from
 * toes already overlapping, a move that ends behind the toe is allowed.
 * Retreat, which only ever moves away, is never refused.
 */
function footwork(c: Combination, poses: Poses, f: FencerId, move: Footwork, presets?: PresetPose[]): Stepped {
  const pose = poses[f];
  const fwd = FORWARD[f];
  const blocked: Stepped = { pose, cramped: 'blocked' };
  /** As far forward from `stand` as `want`, the piste and the opponent's toe allow. */
  const forward = (stand: Pose, want: number): Stepped => {
    const gap = room(c, poses, f, stand);
    if (gap < FITS) return blocked;
    const travel = Math.max(0, Math.min(want, gap, PISTE_HALF - stand.root.x * fwd));
    return { pose: at(stand, stand.root.x + fwd * travel), cramped: travel < want - 1e-6 ? 'short' : undefined };
  };
  switch (move) {
    case 'advance':
      return forward(guardLegs(c, f, pose, presets), STEP_LENGTH);
    case 'retreat': {
      const stand = guardLegs(c, f, pose, presets);
      const travel = Math.max(0, Math.min(STEP_LENGTH, PISTE_HALF + stand.root.x * fwd));
      return { pose: at(stand, stand.root.x - fwd * travel), cramped: travel < STEP_LENGTH - 1e-6 ? 'short' : undefined };
    }
    case 'lunge':
    case 'half-lunge': {
      const want = move === 'lunge' ? 1 : 0.5;
      const fit = lungeWithin(c, poses, f, pose, want, presets);
      return fit ? { pose: fit.pose, cramped: fit.depth < want ? 'short' : undefined } : blocked;
    }
    case 'recover': {
      // Back to en garde, arm and all, over the back foot. Never shifted: if en garde there would stand past the opponent's toe, there is no room.
      const guard = plantRear(c, f, pose, { ...pose, joints: presetJoints(c, f, 'en-garde', presets) });
      return room(c, poses, f, guard) < FITS ? blocked : { pose: guard };
    }
    case 'fleche':
      return forward(flecheFrom(c, f, pose, presets), FLECHE_TRAVEL);
  }
}

/** The flèche pose standing where en garde over the back foot has the hips: where a flèche starts its run. */
function flecheFrom(c: Combination, f: FencerId, pose: Pose, presets?: PresetPose[]): Pose {
  const stand = guardLegs(c, f, pose, presets);
  const p = poseFromPreset(findPreset('fleche', presets), c.fencers[f].handedness, pose);
  return { ...p, root: { ...p.root, x: stand.root.x, z: stand.root.z } };
}

// Finding the right place -------------------------------------------------

/**
 * Where along the piste `lands` first comes true, moving toward the opponent
 * from `x0`. With `backOff`, when it is already true at `x0` it backs away
 * to the furthest place it is still true. Returns null if it never lands
 * before `limit` (metres travelled).
 */
function edge(lands: (x: number) => boolean, x0: number, fwd: number, backOff: boolean, limit: number): number | null {
  const STEP = 0.1;
  let ok: number;
  let fail: number;
  if (lands(x0)) {
    if (!backOff) return x0;
    ok = x0;
    fail = x0 - fwd * STEP;
    for (let i = 0; i < 40 && lands(fail); i++) {
      ok = fail;
      fail -= fwd * STEP;
    }
  } else {
    fail = x0;
    let found: number | null = null;
    for (let d = STEP; d <= limit + 1e-9; d += STEP) {
      const x = x0 + fwd * d;
      if (lands(x)) {
        found = x;
        break;
      }
      fail = x;
    }
    if (found === null) {
      if (lands(x0 + fwd * limit)) found = x0 + fwd * limit;
      else return null;
    }
    ok = found;
  }
  for (let i = 0; i < 5; i++) {
    const mid = (ok + fail) / 2;
    if (lands(mid)) ok = mid;
    else fail = mid;
  }
  return ok;
}

/** Where the point would be put on the opponent's body, and how far along the piste it still is from it. */
function gapAlong(c: Combination, poses: Poses, f: FencerId, pose: Pose): number {
  const opp = other(f);
  const tip = rigOf(c, f, pose).tip;
  const target = targetPoint(rigOf(c, opp, poses[opp]), 'body', weaponSide(c, opp), tip);
  return (target.x - tip.x) * FORWARD[f];
}

function hitLands(c: Combination, poses: Poses, f: FencerId, x: number, w: 'arm' | 'lunge', presets?: PresetPose[]): boolean {
  const placed = place(c, poses, f, at(poses[f], x));
  if (Math.abs(placed.root.x - x) > 1e-6) return false;
  if (w === 'lunge') return hit(c, { ...poses, [f]: placed }, f, 'body', w, presets).short === 0;
  // Short distance is the arm alone, standing upright: no leaning in.
  const opp = other(f);
  const target = targetPoint(rigOf(c, opp, poses[opp]), 'body', weaponSide(c, opp), rigOf(c, f, placed).tip);
  return pointTo(c, f, placed, target).miss < 0.02;
}

function distance(c: Combination, poses: Poses, f: FencerId, measure: Measure, presets?: PresetPose[]): Pose {
  const pose = poses[f];
  const fwd = FORWARD[f];
  const w = measure === 'short' ? 'arm' : 'lunge';
  // A first guess from the reaching pose (arm extended, or lunging), then the real hit decides.
  const reaching =
    w === 'arm' ? take(pose, presetJoints(c, f, 'extension', presets), weaponArm(weaponSide(c, f))) : lungePose(c, f, pose, 1, presets);
  const guess = pose.root.x + fwd * gapAlong(c, poses, f, reaching);
  const start = guess - fwd * 0.2;
  const x = edge((x) => hitLands(c, poses, f, x, w, presets), start, fwd, true, 3) ?? guess;
  const settled = measure === 'long' ? x - fwd * STEP_LENGTH : x;
  return place(c, poses, f, at(pose, settled));
}

// Arm ------------------------------------------------------------------------

function extend(c: Combination, f: FencerId, pose: Pose, presets?: PresetPose[]): Pose {
  return take(pose, presetJoints(c, f, 'extension', presets), weaponArm(weaponSide(c, f)));
}

/** The weapon arm in the position of parry `n` (and, for prime, the turned body and head). */
function parryArm(c: Combination, f: FencerId, pose: Pose, n: ParryNumber, presets?: PresetPose[]): Pose {
  const id = `parry-${n}`;
  const shaped = presetJoints(c, f, id, presets);
  let next = take(pose, shaped, weaponArm(weaponSide(c, f)));
  // Prime turns the body and head as well; take those where the parry differs from en garde.
  const raw = findPreset(id, presets).pose.joints;
  const guard = findPreset('en-garde', presets).pose.joints;
  const differs = (n: JointName) => JSON.stringify(raw[n] ?? {}) !== JSON.stringify(guard[n] ?? {});
  const changed = [...TORSO, ...HEAD].filter(differs);
  if (changed.length) next = take(next, shaped, changed);
  return next;
}

// Blade against blade ------------------------------------------------------
//
// A line is named for where the opponent's blade ends up: in sixte, tierce,
// octave and seconde it is carried to the fencer's outside (the weapon-arm
// side), in quarte, septime and prime to the inside. So after "parry 6" or
// "engage 6" the opponent's blade lies outside the fencer's own, strong
// against weak, and the point that was on target has been carried off it.

const OUTSIDE_LINES: ParryNumber[] = [2, 3, 6, 8];

/** Which way (horizontally) blade work in this line carries the opponent's blade. */
function carries(c: Combination, f: FencerId, n: ParryNumber): Vector3 {
  const out = outsideOf(c, f);
  return OUTSIDE_LINES.includes(n) ? out : out.negate();
}

/**
 * Parry: the hand goes to the parry's position, and if the opponent's blade
 * has come within reach of the strong part of the blade it is carried aside
 * with it. Otherwise it is a parry in the air.
 */
function parry(c: Combination, poses: Poses, f: FencerId, n: ParryNumber, presets?: PresetPose[]): Poses {
  const taken = { ...poses, [f]: parryArm(c, f, poses[f], n, presets) };
  const laid = layAgainst(c, taken, f, carries(c, f, n), 'forte', PARRY_REACH);
  return laid ?? pushBlades(c, poses, taken, f);
}

/** Engage (take the blade): the hand goes to the line's position with the opponent's blade held against it. */
function engage(c: Combination, poses: Poses, f: FencerId, line: Line, presets?: PresetPose[]): Poses | null {
  const n = LINE_NUMBER[line];
  const taken = { ...poses, [f]: parryArm(c, f, poses[f], n, presets) };
  return layAgainst(c, taken, f, carries(c, f, n), 'forte');
}

/**
 * Beat: the opponent's blade is knocked aside where it is weak, shown at the
 * moment of contact with the mover's blade against it. The mover's hand
 * hardly moves; the wrist does the work.
 */
function beat(c: Combination, poses: Poses, f: FencerId, line: Line): Poses | null {
  const opp = other(f);
  const side = carries(c, f, LINE_NUMBER[line]);
  const o = rigOf(c, opp, poses[opp]);
  const struck = o.guard.clone().lerp(o.tip, BEAT_AT).addScaledVector(side, BEAT_KNOCK);
  const knocked = { ...poses, [opp]: swingBlade(c, poses, opp, BEAT_AT, struck) };
  // The mover's blade meets it from the other side.
  return layAgainst(c, knocked, opp, side.clone().negate(), 'foible', 0.9, 0.15);
}

// Hit ------------------------------------------------------------------------

/** Did a hit fall short because the target is too near, not too far? The point has gone past it, or it is nearer than the blade is long. */
function tooClose(c: Combination, poses: Poses, f: FencerId, area: TargetArea): boolean {
  const opp = other(f);
  const mine = rigOf(c, f, poses[f]);
  const s = weaponSide(c, f);
  const target = targetPoint(rigOf(c, opp, poses[opp]), area, weaponSide(c, opp), mine.tip);
  const blade = mine.tip.distanceTo(jointPosition(mine, `wrist_${s}`));
  const past = (mine.tip.x - target.x) * FORWARD[f] > 0.05;
  return past || target.distanceTo(jointPosition(mine, `shoulder_${s}`)) < blade + 0.1;
}

function hit(c: Combination, poses: Poses, f: FencerId, area: TargetArea, w: HitWith, presets?: PresetPose[]): ActionResult {
  const r = hitBy(c, poses, f, area, w, presets);
  return r.short ? { ...r, close: tooClose(c, r.poses, f, area) } : r;
}

/**
 * A hit, by these rules:
 * - it never moves the feet it stands on (`standing`);
 * - it never ends behind where the fencer already is, or past the opponent's
 *   front toe: footwork that would is not tried;
 * - with a lunge or a flèche it goes only as far as the hit needs;
 * - if the footwork cannot land it but the arm can from where the fencer
 *   stands, the arm does it (and, if that was for want of room, says so);
 * - if nothing lands, the fencer is not sent forward past the target: they
 *   stay, unless going forward leaves the point nearer and still short.
 */
function hitBy(c: Combination, poses: Poses, f: FencerId, area: TargetArea, w: HitWith, presets?: PresetPose[]): ActionResult {
  const fwd = FORWARD[f];
  const done = (r: { pose: Pose; short: number }, cramped?: Cramped): ActionResult => ({
    poses: pushBlades(c, poses, { ...poses, [f]: r.pose }, f),
    short: r.short,
    ...(cramped && { cramped }),
  });
  // From where the fencer stands, with the arm alone.
  const here = standing(c, poses, f, area, poses[f]);
  if (w === 'arm') return done(here);

  const toe = (p: Pose) => frontToe(rigOf(c, f, p), f).x * fwd;
  const hips = (p: Pose) => p.root.x * fwd;
  const now = poses[f];
  /** Would a miss from this pose be cured by going further forward? (Not if the point is already past the target.) */
  const stillShort = (p: Pose) => !tooClose(c, { ...poses, [f]: p }, f, area);
  let noRoom = false;
  /** The best the footwork has done so far. */
  const tried: { best: { pose: Pose; short: number } | null } = { best: null };
  const consider = (r: { pose: Pose; short: number }) => {
    if (!tried.best || r.short < tried.best.short) tried.best = r;
    return r.short === 0;
  };

  if (w === 'lunge') {
    // Only lunges that go forward from here: a fencer already lunging is not drawn back into a shallower one.
    for (const depth of LUNGE_DEPTHS) {
      const lunged = lungePose(c, f, now, depth, presets);
      if (toe(lunged) < toe(now) + 0.02) continue;
      if (room(c, poses, f, lunged) < FITS) {
        noRoom = true;
        break;
      }
      const r = standing(c, poses, f, area, lunged);
      if (room(c, poses, f, r.pose) < FITS) {
        noRoom = true;
        continue;
      }
      if (consider(r)) return done(r);
    }
  } else {
    // A flèche runs forward from where en garde over the back foot stands, or from where the hips are if they are further on.
    const from = flecheFrom(c, f, now, presets);
    const x0 = Math.max(hips(from), hips(now)) * fwd;
    const start = at(from, x0);
    const gap = room(c, poses, f, start);
    if (gap < FITS) noRoom = true;
    else {
      const limit = Math.max(0, Math.min(FLECHE_MAX, gap, PISTE_HALF - x0 * fwd));
      const tryAt = (x: number) => {
        const r = touch(c, { ...poses, [f]: at(from, x) }, f, area);
        return { pose: r.poses[f], short: r.short, fits: room(c, poses, f, r.poses[f]) >= FITS };
      };
      const x = edge((x) => {
        const t = tryAt(x);
        return t.fits && t.short === 0;
      }, x0, fwd, false, limit);
      const end = tryAt(x ?? x0 + fwd * limit);
      if (!end.fits) noRoom = true;
      else if (consider(end)) return done(end);
    }
  }

  // The footwork did not land it. The arm alone, if that does.
  if (here.short === 0) return done(here, noRoom ? 'short' : undefined);
  // Nothing lands. Going forward is kept only if it leaves the point nearer and still short of the target, not past it.
  const forward = tried.best;
  if (forward && forward.short < here.short - 0.01 && stillShort(forward.pose)) return done(forward);
  return done(here, noRoom ? 'short' : undefined);
}

/**
 * The hit from a stance already taken. Reaching may lean the hips, which
 * swings the legs with them: so both feet are put back where the stance has
 * them (the legs re-bend under the leaning hips; if a foot could not stay,
 * less of the lean is used), the arm is aimed again, and how far short it
 * fell is worked out from that finished pose. A hit never moves the feet it
 * stands on.
 */
function standing(c: Combination, poses: Poses, f: FencerId, area: TargetArea, stance: Pose): { pose: Pose; short: number } {
  const opp = other(f);
  const setup = c.fencers[f];
  const reached = touch(c, { ...poses, [f]: stance }, f, area);
  const feet = pick(placesOf(stance, setup, HEADING[f]), ['foot_r', 'foot_l']);
  const planted = editKept(feet, stance, reached.poses[f], setup, HEADING[f]).pose;
  // The feet never moved (no lean was needed): the reach stands as it is.
  if (planted === reached.poses[f]) return { pose: planted, short: reached.short };
  const target = targetPoint(rigOf(c, opp, poses[opp]), area, weaponSide(c, opp), rigOf(c, f, planted).tip);
  const aimed = armTo(c, f, planted, target);
  return { pose: aimed.pose, short: aimed.miss < 0.02 ? 0 : aimed.miss };
}

// ---------------------------------------------------------------------------

/** Apply `action` for `mover` to the poses of one step. `presets` is the coach's list (their edited copies of built-ins win); defaults to the built-ins. */
export function applyAction(c: Combination, poses: Poses, mover: FencerId, action: Action, presets?: PresetPose[]): ActionResult {
  const withMover = (pose: Pose): ActionResult => ({ poses: pushBlades(c, poses, { ...poses, [mover]: pose }, mover) });
  switch (action.kind) {
    case 'footwork': {
      const stepped = footwork(c, poses, mover, action.move, presets);
      if (stepped.cramped === 'blocked') return { poses, cramped: 'blocked' };
      return { ...withMover(stepped.pose), cramped: stepped.cramped };
    }
    case 'distance':
      // Only the place changes, never the arm, so blades are left as they are.
      return { poses: { ...poses, [mover]: distance(c, poses, mover, action.measure, presets) } };
    case 'extend':
      return withMover(extend(c, mover, poses[mover], presets));
    case 'parry':
      return { poses: parry(c, poses, mover, action.number, presets) };
    case 'engage': {
      const met = engage(c, poses, mover, action.line, presets);
      return met ? { poses: met } : { poses, apart: true };
    }
    case 'beat': {
      const met = beat(c, poses, mover, action.line);
      return met ? { poses: met } : { poses, apart: true };
    }
    case 'hit':
      return hit(c, poses, mover, action.area, action.with, presets);
  }
}

const FOOTWORK_NAMES: Record<Footwork, string> = {
  advance: 'Advance',
  retreat: 'Retreat',
  'half-lunge': 'Half lunge',
  lunge: 'Lunge',
  recover: 'Recover',
  fleche: 'Flèche',
};
const HIT_WITH: Record<HitWith, string> = { arm: '', lunge: ' with a lunge', fleche: ' with a flèche' };

/** A short label in a coach's words, without the fencer: "Beat 6", "Lunge", "Parry 4", "Hits the arm with a lunge", "Medium distance". */
export function actionLabel(action: Action): string {
  switch (action.kind) {
    case 'footwork':
      return FOOTWORK_NAMES[action.move];
    case 'distance':
      return `${action.measure[0].toUpperCase()}${action.measure.slice(1)} distance`;
    case 'extend':
      return 'Extension';
    case 'parry':
      return `Parry ${action.number}`;
    case 'beat':
      return `Beat ${LINE_NUMBER[action.line]}`;
    case 'engage':
      return `Engage ${LINE_NUMBER[action.line]}`;
    case 'hit':
      return `Hits the ${TARGET_NAMES[action.area].toLowerCase()}${HIT_WITH[action.with]}`;
  }
}

/** Every name an action can write on a step ("Lunge", "Parry 4", "Hits the hand with a lunge"); distances are never written. */
export const ACTION_LABELS: ReadonlySet<string> = new Set(
  (
    [
      ...(Object.keys(FOOTWORK_NAMES) as Footwork[]).map((move) => ({ kind: 'footwork', move })),
      { kind: 'extend' },
      ...([1, 2, 3, 4, 6, 7, 8] as ParryNumber[]).map((number) => ({ kind: 'parry', number })),
      ...(Object.keys(LINE_NUMBER) as Line[]).flatMap((line) => [{ kind: 'beat', line }, { kind: 'engage', line }]),
      ...(Object.keys(TARGET_NAMES) as TargetArea[]).flatMap((area) => (Object.keys(HIT_WITH) as HitWith[]).map((w) => ({ kind: 'hit', area, with: w }))),
    ] as Action[]
  ).map(actionLabel),
);

/** Pins that send `f`'s point under or over the opponent's blade on the way into step `to` (to >= 1); null for 'direct' (no pins). */
export function shapePath(c: Combination, to: number, f: FencerId, shape: PathShape): Pin[] | null {
  if (shape === 'direct') return null;
  // Work out the path without this fencer's shaping of the move: the caller replaces it.
  const step = c.steps[to];
  const strip = <T>(rec: Partial<Record<FencerId, T>> | undefined) => {
    if (!rec) return undefined;
    const { [f]: _, ...rest } = rec;
    return Object.keys(rest).length ? (rest as Partial<Record<FencerId, T>>) : undefined;
  };
  const plain = { ...step, pins: strip(step.pins), bend: strip(step.bend), via: strip(step.via) };
  const bare: Combination = { ...c, steps: c.steps.map((s, i) => (i === to ? plain : s)) };

  const frame = frameAt(bare, to - 0.5).poses;
  const opp = other(f);
  const mine = rigOf(c, f, frame[f]);
  const theirs = rigOf(c, opp, frame[opp]);
  const P = mine.tip;
  const G = theirs.guard;
  const T = theirs.tip;
  let target: Vector3;
  if (shape === 'under') {
    const nearest = new Line3(G, T).closestPointToPoint(P, true, new Vector3());
    target = nearest.add(new Vector3(0, -UNDER_CLEARANCE, 0));
  } else {
    const span = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)];
    const [m0, m1] = span(mine.guard.x, P.x);
    const [o0, o1] = span(G.x, T.x);
    const overlap = m0 <= o1 && o0 <= m1;
    target = overlap ? T.clone().add(new Vector3(0, OVER_CLEARANCE, 0)) : P.clone().add(new Vector3(0, OVER_LIFT, 0));
  }
  return [pinFor(bare, to, f, target, 0.5)];
}
