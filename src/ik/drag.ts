import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { clampDof, type JointName, type Side } from '../model/joints.ts';
import { tweenPose } from '../model/tween.ts';
import { angle, type FencerSetup, type Pose } from '../model/types.ts';
import { jointPosition, jointRotation, solveRig, type Rig } from '../rig/kinematics.ts';
import { EPEE } from '../rig/layout.ts';
import { aim, footHolds, plantFeet, reach, worldQ, type FootHold } from './ik.ts';

// Posing by dragging dots. A dot is a place on the body: it goes where it is
// dragged and the joints work out how. The same dots are used by the handles
// in the 3D view and by the flat sketch under it.
//
// CONTRACT (shared by the sketch, the 3D handles and the store). The types
// and signatures below are fixed; the bodies are a first, simple version.

/** Every place on a fencer that can be dragged. */
export type Dot =
  | 'hips'
  | 'chest'
  | 'head'
  | 'hand_r'
  | 'hand_l'
  | 'elbow_r'
  | 'elbow_l'
  | 'foot_r'
  | 'foot_l'
  | 'knee_r'
  | 'knee_l'
  | 'point';

export const DOTS: Dot[] = ['hips', 'chest', 'head', 'hand_r', 'hand_l', 'elbow_r', 'elbow_l', 'foot_r', 'foot_l', 'knee_r', 'knee_l', 'point'];

/**
 * What stays where it is while something else is moved: both feet, the
 * weapon hand, the épée point. Editor state, never saved with a combination.
 */
export interface Keep {
  feet: boolean;
  hand: boolean;
  point: boolean;
}

export const DEFAULT_KEEP: Keep = { feet: true, hand: false, point: false };

/** The joint a dot sits on (the point sits on the grip); clicking a dot selects it. */
export const DOT_JOINT: Record<Dot, JointName> = {
  hips: 'pelvis',
  chest: 'chest',
  head: 'neck',
  hand_r: 'wrist_r',
  hand_l: 'wrist_l',
  elbow_r: 'elbow_r',
  elbow_l: 'elbow_l',
  foot_r: 'ankle_r',
  foot_l: 'ankle_l',
  knee_r: 'knee_r',
  knee_l: 'knee_l',
  point: 'grip',
};

/** Centre of the head, in world space. */
export function headCentre(rig: Rig): Vector3 {
  const H = rig.layout.height;
  return new Vector3(0.008 * H, 0.088 * H, 0).applyMatrix4(rig.world.neck);
}

/** Where each dot sits on the posed fencer, in world space. */
export function dotPositions(rig: Rig): Record<Dot, Vector3> {
  return {
    hips: jointPosition(rig, 'pelvis'),
    // The base of the neck: the top of the spine.
    chest: jointPosition(rig, 'neck'),
    head: headCentre(rig),
    hand_r: jointPosition(rig, 'wrist_r'),
    hand_l: jointPosition(rig, 'wrist_l'),
    elbow_r: jointPosition(rig, 'elbow_r'),
    elbow_l: jointPosition(rig, 'elbow_l'),
    foot_r: jointPosition(rig, 'ankle_r'),
    foot_l: jointPosition(rig, 'ankle_l'),
    knee_r: jointPosition(rig, 'knee_r'),
    knee_l: jointPosition(rig, 'knee_l'),
    point: rig.tip.clone(),
  };
}

/** The dots held in place for this fencer by `keep`. */
export function keptDots(setup: FencerSetup, keep: Keep): Dot[] {
  const w = setup.handedness === 'right' ? 'r' : 'l';
  return [...(keep.feet ? (['foot_r', 'foot_l'] as Dot[]) : []), ...(keep.hand ? ([`hand_${w}`] as Dot[]) : []), ...(keep.point ? (['point'] as Dot[]) : [])];
}

// ---------------------------------------------------------------------------
// The solving. A dragged hand or foot reaches with its own limb; if the limb
// cannot get there, the body follows: the pelvis slides along the floor
// toward the target (sinking only as far as the planted legs need), never
// further than the legs allow. The spine and head are bent by small
// least-squares steps inside the joint limits. Afterwards whatever `keep`
// names is put back.

const DEG = Math.PI / 180;
type Build = (pose: Pose) => Rig;
type Limb = 'arm' | 'leg';

/** How far short of straight the body-following lets an arm or leg go, metres. */
const ARM_SLACK = 0.002;
const LEG_SLACK = 0.005;
/** The pelvis never sinks below this fraction of standing height to let a limb reach. */
const LOWEST_PELVIS = 0.25;
/** A planted foot may end up this far from where it was, at most. */
const PLANTED = 0.02;
/** Below this, nothing has moved. */
const STILL = 5e-4;

const otherSide = (s: Side): Side => (s === 'r' ? 'l' : 'r');
const weaponSide = (setup: FencerSetup): Side => (setup.handedness === 'right' ? 'r' : 'l');

/** The fencer as the drag found it. */
interface Start {
  pose: Pose;
  setup: FencerSetup;
  heading: number;
  keep: Keep;
  /** The weapon hand's side. */
  w: Side;
  build: Build;
  rig: Rig;
  pelvis: Vector3;
}

function begin(pose: Pose, setup: FencerSetup, heading: number, keep: Keep): Start {
  const build: Build = (p) => solveRig(setup, p, heading);
  const rig = build(pose);
  return { pose, setup, heading, keep, w: weaponSide(setup), build, rig, pelvis: jointPosition(rig, 'pelvis') };
}

/** `aim`, except that a target on the wrist itself leaves the hand alone. */
function safeAim(pose: Pose, build: Build, setup: FencerSetup, target: Vector3): Pose {
  const r = build(pose);
  if (jointPosition(r, `wrist_${weaponSide(setup)}`).distanceTo(target) < 1e-4) return pose;
  return aim(pose, build, setup, target);
}

/** A limb root that must stay within `R` of `target`; `from` is where the root is now. */
interface Chain {
  from: Vector3;
  target: Vector3;
  R: number;
}

interface Follow {
  /** Horizontal direction the pelvis slides. */
  u: Vector3;
  /** How far it slides. */
  s: number;
  /** Pelvis height when it has slid `s`: as high as the planted legs allow, never above where it was. */
  heightAt: (s: number) => number;
}

/**
 * How far the pelvis must slide along the floor (toward the goal) so the
 * goal's limb can reach it, with the planted legs still reaching their feet.
 * The smallest slide that does it; if none does, the slide that gets the
 * goal nearest. Plain arithmetic, no posing, so it is cheap.
 */
function followBody(goal: Chain, planted: Chain[], y0: number, minY: number): Follow {
  const u = goal.target.clone().sub(goal.from).setY(0);
  const hz0 = u.length();
  const heightAt = (s: number): number => {
    let h = y0;
    for (const c of planted) {
      const dx = c.from.x + u.x * s - c.target.x;
      const dz = c.from.z + u.z * s - c.target.z;
      const hz2 = dx * dx + dz * dz;
      if (hz2 > c.R * c.R) return -Infinity;
      h = Math.min(h, c.target.y + Math.sqrt(c.R * c.R - hz2) - c.from.y + y0);
    }
    return h;
  };
  const none: Follow = { u, s: 0, heightAt: () => y0 };
  if (hz0 < 1e-6) return none;
  u.divideScalar(hz0);
  const ok = (s: number) => heightAt(s) >= minY;
  const miss = (s: number) => {
    const h = heightAt(s);
    const dx = goal.from.x + u.x * s - goal.target.x;
    const dy = goal.from.y + h - y0 - goal.target.y;
    const dz = goal.from.z + u.z * s - goal.target.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - goal.R;
  };
  if (miss(0) <= 0 || !ok(0)) return none;

  // How far the legs let the pelvis go: never past the goal, nor more than
  // twice the shortfall (a target nearly straight above or below the limb
  // would otherwise send the body racing under it as the target crept
  // toward the top of the reach; this way the body moves at most 2 cm per
  // centimetre of drag, and targets up to 60 degrees off level still land).
  const N = 64;
  const sLimit = Math.min(hz0, 2 * miss(0));
  let sMax = sLimit;
  for (let k = 1; k <= N; k++) {
    if (ok((k * sLimit) / N)) continue;
    let a = ((k - 1) * sLimit) / N;
    let b = (k * sLimit) / N;
    for (let i = 0; i < 30; i++) {
      const m = (a + b) / 2;
      if (ok(m)) a = m;
      else b = m;
    }
    sMax = a;
    break;
  }

  // The smallest slide that reaches.
  const step = sMax / N;
  let best = 0;
  let bestMiss = miss(0);
  for (let k = 1; k <= N; k++) {
    const s = k * step;
    const m = miss(s);
    if (m <= 0) {
      let a = s - step;
      let b = s;
      for (let i = 0; i < 30; i++) {
        const mid = (a + b) / 2;
        if (miss(mid) <= 0) b = mid;
        else a = mid;
      }
      return { u, s: b, heightAt };
    }
    if (m < bestMiss) {
      bestMiss = m;
      best = s;
    }
  }
  // None reaches: the nearest, refined between its neighbours.
  let a = Math.max(0, best - step);
  let b = Math.min(sMax, best + step);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 30; i++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (miss(c) < miss(d)) b = d;
    else a = c;
  }
  return { u, s: (a + b) / 2, heightAt };
}

function plantedChains(st: Start, holds: FootHold[]): Chain[] {
  const L = st.rig.layout;
  const len = L.thigh + L.shank;
  return holds.map((f) => {
    const from = jointPosition(st.rig, `hip_${f.side}`);
    // A leg already stretched further than the slack may stay so.
    return { from, target: f.at, R: Math.min(len - 1e-4, Math.max(len - LEG_SLACK, from.distanceTo(f.at) + 1e-6)) };
  });
}

/** How far the held feet of `pose` are from where they stood (the furthest of them). */
function footSlip(st: Start, pose: Pose, holds: FootHold[]): number {
  if (!holds.length) return 0;
  const r = st.build(pose);
  return Math.max(...holds.map((f) => jointPosition(r, `ankle_${f.side}`).distanceTo(f.at)));
}

/**
 * Try `at(k)` for k = 1 (the whole move); if a planted foot would slip (a
 * joint at its limit), find the largest part of the move that keeps the
 * feet (regula falsi, Illinois variant: the slip grows smoothly once a
 * limit is reached, so a few tries pin it down).
 */
function backOff(st: Start, holds: FootHold[], at: (k: number) => Pose, slip0?: number): { pose: Pose; k: number } {
  const full = at(1);
  const TOL = PLANTED * 0.5;
  let eb = footSlip(st, full, holds) - TOL;
  if (eb <= 0) return { pose: full, k: 1 };
  let a = 0;
  let b = 1;
  let best = at(0);
  let ea = (slip0 ?? footSlip(st, best, holds)) - TOL;
  if (ea > 0) return { pose: best, k: 0 };
  let side = 0;
  for (let i = 0; i < 8; i++) {
    const k = Math.min(b - 1e-4, Math.max(a + 1e-4, a - (ea * (b - a)) / (eb - ea)));
    const p = at(k);
    const ek = footSlip(st, p, holds) - TOL;
    if (ek <= 0) {
      a = k;
      ea = ek;
      best = p;
      if (side === -1) eb /= 2;
      side = -1;
      if (ek > -0.002) break;
    } else {
      b = k;
      eb = ek;
      if (side === 1) ea /= 2;
      side = 1;
    }
    if (b - a < 2e-3) break;
  }
  return { pose: best, k: a };
}

/** Which way an elbow or knee bends out of the line from its limb's root to its end. */
function bendOf(rig: Rig, limb: Limb, side: Side): Vector3 | undefined {
  const root = jointPosition(rig, limb === 'arm' ? `shoulder_${side}` : `hip_${side}`);
  const mid = jointPosition(rig, limb === 'arm' ? `elbow_${side}` : `knee_${side}`);
  const axis = jointPosition(rig, limb === 'arm' ? `wrist_${side}` : `ankle_${side}`).sub(root).normalize();
  const bend = mid.sub(root);
  bend.addScaledVector(axis, -bend.dot(axis));
  return bend.lengthSq() > 1e-8 ? bend.normalize() : undefined;
}

/**
 * Reach a hand or foot to `target`, facing `facing`; if the limb is too
 * short, the body follows (see `followBody`). With `keep.feet` the other
 * feet stay planted; without, the whole fencer slides.
 */
function limbTo(st: Start, limb: Limb, side: Side, target: Vector3, facing: Quaternion, armMiss?: (p: Pose) => number): Pose {
  const r = st.rig;
  const L = r.layout;
  const root = jointPosition(r, limb === 'arm' ? `shoulder_${side}` : `hip_${side}`);
  const len = limb === 'arm' ? L.upperArm + L.forearm - ARM_SLACK : L.thigh + L.shank - LEG_SLACK;
  const holds = st.keep.feet ? footHolds(r, limb === 'leg' ? [otherSide(side)] : ['r', 'l']) : [];
  const y0 = st.pelvis.y;
  const f = followBody({ from: root, target, R: len }, plantedChains(st, holds), y0, Math.min(y0, LOWEST_PELVIS * L.height));
  const bend = bendOf(r, limb, side);
  /** The body moved `k` of the way, planted legs re-bent; `h` its pelvis height. */
  const body = (k: number) => {
    const s = f.s * k;
    const h = f.heightAt(s);
    const P = st.pelvis.clone().addScaledVector(f.u, s).setY(h);
    let p: Pose = { ...st.pose, root: { ...st.pose.root, x: P.x, z: P.z } };
    if (holds.length && (s > 0 || h < y0)) p = plantFeet(p, st.setup, st.heading, P, holds);
    return { p, h };
  };
  const held = (h: number): Build => (q) => solveRig(st.setup, q, st.heading, h);
  if (limb === 'arm') {
    // The arm hardly changes where the fencer stands, so find how far the
    // body may go first, then reach from where it really is (if a planted
    // foot slipped a little, the whole fencer moved with it).
    const p = f.s > 0 ? backOff(st, holds, (k) => body(k).p, 0).pose : st.pose;
    return reachArm(st, p, side, target, bend, facing, armMiss);
  }
  // A leg does change it (the dragged foot may tip), so it is part of the trial.
  const at = (k: number) => {
    const { p, h } = body(k);
    return reach(p, held(h), limb, side, target, bend, facing);
  };
  return f.s > 0 ? backOff(st, holds, at).pose : at(1);
}

/**
 * Reach the hand to `target` with the elbow pointing as it does now. If that
 * does not arrive (the shoulder's limits stop the hand short of a place the
 * arm is long enough for, or, for the point, the elbow bends a way the wrist
 * cannot make up for and the blade swings off its line), try the elbow
 * pointing down, out, or both, and take whichever arrives best. So pulling a
 * straight arm back bends the elbow where the blade can stay on line,
 * instead of going nowhere.
 */
function reachArm(
  st: Start,
  pose: Pose,
  side: Side,
  target: Vector3,
  bend: Vector3 | undefined,
  facing: Quaternion,
  /** What counts as arriving, in metres off; by default how far the hand is from `target`. */
  missOf: (p: Pose) => number = (p) => jointPosition(st.build(p), `wrist_${side}`).distanceTo(target),
): Pose {
  const first = reach(pose, st.build, 'arm', side, target, bend, facing);
  let best = { pose: first, miss: missOf(first) };
  if (best.miss < 0.01) return first;
  const r = st.build(pose);
  const out = jointPosition(r, `shoulder_${side}`).sub(jointPosition(r, `shoulder_${otherSide(side)}`)).setY(0).normalize();
  const down = new Vector3(0, -1, 0);
  for (const pole of [down.clone().add(out), down, out]) {
    const tried = reach(pose, st.build, 'arm', side, target, pole, facing);
    const miss = missOf(tried);
    // Only change the elbow's direction for a clear gain.
    if (miss < best.miss - 0.01) best = { pose: tried, miss };
    if (miss < 0.01) break;
  }
  return best.pose;
}

/**
 * Bring the point back onto `target` after the body moved: the hand goes back
 * where it was, facing as it did; if the arm cannot quite do that, the arm is
 * walked from there in small steps until the point is back (no body following).
 */
function settlePoint(st: Start, pose: Pose, target: Vector3, wristGoal: Vector3, facing: Quaternion): Pose {
  // First the whole hand as it was: if the arm reaches, the point is back exactly.
  const kept = reach(pose, st.build, 'arm', st.w, wristGoal, undefined, facing);
  const r = st.build(kept);
  if (r.tip.distanceTo(target) < 0.001) return kept;
  // Otherwise walk the arm from there, in small steps, until the point is back.
  return nudge(kept, armDofs(st.w), armTip(st, r), target);
}

/** The weapon arm's movements, and how freely each may turn (turning the hand over costs more). */
function armDofs(w: Side): Dof[] {
  return [
    { joint: `shoulder_${w}`, dof: 'flex', weight: 1 },
    { joint: `shoulder_${w}`, dof: 'abduct', weight: 1 },
    { joint: `shoulder_${w}`, dof: 'twist', weight: 0.7 },
    { joint: `elbow_${w}`, dof: 'flex', weight: 1 },
    { joint: `wrist_${w}`, dof: 'flex', weight: 1 },
    { joint: `wrist_${w}`, dof: 'deviate', weight: 1 },
    { joint: `wrist_${w}`, dof: 'pronate', weight: 0.4 },
  ];
}

/**
 * Where the point is for a pose that differs from `rig`'s only in the weapon
 * arm, worked out from the chest along the arm without posing the whole body.
 */
function armTip(st: Start, rig: Rig): (p: Pose) => Vector3 {
  const w = st.w;
  const one = new Vector3(1, 1, 1);
  const wrist = `wrist_${w}` as const;
  // The épée's frame in the hand does not change.
  const grip = rig.world[wrist].clone().invert().multiply(rig.world.grip);
  const tip = new Vector3(0, -EPEE.wristToGuard - EPEE.blade, 0);
  const chain = [`shoulder_${w}`, `elbow_${w}`, wrist] as const;
  return (p) => {
    const m = rig.world.chest.clone();
    for (const j of chain) {
      const [x, y, z] = rig.layout.offsets[j];
      m.multiply(new Matrix4().compose(new Vector3(x, y, z), jointRotation(p, j), one));
    }
    return tip.clone().applyMatrix4(m.multiply(grip));
  };
}

/** Where a hand is and which way it faces. */
interface HandPlace {
  at: Vector3;
  facing: Quaternion;
}

/**
 * Where the things that can be kept are: each foot, the weapon hand, and the
 * point (with the hand that held it there).
 */
export interface Places {
  foot_r: FootHold;
  foot_l: FootHold;
  hand: HandPlace;
  point: HandPlace & { tip: Vector3 };
}
export type Kept = keyof Places;

/** An edit is cut back until every kept thing is within this of its place (the rule is "about 2 cm"). */
export const KEPT_WITHIN = 0.012;
/** No edit may ever leave a kept thing further than this from its place. */
export const KEPT_AT_MOST = 0.02;

function placesOfRig(rig: Rig, w: Side): Places {
  const [foot_r, foot_l] = footHolds(rig, ['r', 'l']);
  const wrist = `wrist_${w}` as const;
  const hand = { at: jointPosition(rig, wrist), facing: worldQ(rig.world[wrist]) };
  return { foot_r, foot_l, hand, point: { ...hand, tip: rig.tip.clone() } };
}

/** Where everything that can be kept is, on this pose. */
export function placesOf(pose: Pose, setup: FencerSetup, heading: number): Places {
  return placesOfRig(solveRig(setup, pose, heading), weaponSide(setup));
}

/** Only the named places. */
export function pick(places: Partial<Places>, kept: readonly Kept[]): Partial<Places> {
  const out: Partial<Places> = {};
  for (const k of kept) if (places[k]) Object.assign(out, { [k]: places[k] });
  return out;
}

/** Where each of these kept things is on `rig`. */
function keptAt(rig: Rig, w: Side, kept: Kept): Vector3 {
  if (kept === 'point') return rig.tip;
  return jointPosition(rig, kept === 'hand' ? `wrist_${w}` : kept === 'foot_r' ? 'ankle_r' : 'ankle_l');
}

/** How far a kept thing is from its place on this pose. */
export function slipOf(place: Places[Kept], kept: Kept, pose: Pose, setup: FencerSetup, heading: number): number {
  const at = kept === 'point' ? (place as Places['point']).tip : (place as FootHold | HandPlace).at;
  return keptAt(solveRig(setup, pose, heading), weaponSide(setup), kept).distanceTo(at);
}

/** How far the furthest of these kept things is from its place. */
function worstSlip(places: Partial<Places>, pose: Pose, setup: FencerSetup, heading: number): number {
  const rig = solveRig(setup, pose, heading);
  const w = weaponSide(setup);
  let worst = 0;
  for (const kept of Object.keys(places) as Kept[]) {
    const place = places[kept]!;
    const at = kept === 'point' ? (place as Places['point']).tip : (place as FootHold | HandPlace).at;
    worst = Math.max(worst, keptAt(rig, w, kept).distanceTo(at));
  }
  return worst;
}

/**
 * Kept things win. `at(k)` is the pose for a share `k` of an edit or a drag
 * (0 = `from`, as it was; 1 = all of it), with the keeps already re-solved.
 * If all of it leaves every kept thing within reach of its place, that is
 * the answer; otherwise the largest share found by halving that does. The
 * search is bounded, not exhaustive: it only ever returns a pose it checked,
 * or `from` itself.
 */
function holdKept(
  places: Partial<Places>,
  from: Pose,
  at: (k: number) => Pose,
  setup: FencerSetup,
  heading: number,
  halvings = 8,
): { pose: Pose; cut: boolean } {
  // Within the allowance; or, for a fencer who already stands at its edge
  // (an earlier edit was cut back there), no worse than they are, and never
  // past the hard limit. So an edit elsewhere on the body is not refused
  // over a millimetre of re-solving, and nothing can creep.
  const was = worstSlip(places, from, setup, heading);
  const ok = (p: Pose) => {
    if (!finite(p)) return false;
    const slip = worstSlip(places, p, setup, heading);
    return slip <= KEPT_WITHIN || (slip <= KEPT_AT_MOST && slip <= was + 0.002);
  };
  const all = at(1);
  if (ok(all)) return { pose: all, cut: false };
  let lo = 0;
  let hi = 1;
  let best = from;
  for (let i = 0; i < halvings; i++) {
    const mid = (lo + hi) / 2;
    const p = at(mid);
    if (ok(p)) {
      lo = mid;
      best = p;
    } else hi = mid;
  }
  return { pose: best, cut: true };
}

/**
 * Put a kept weapon hand or point back where `places` has it, after the body
 * moved. The elbow keeps pointing as it does unless the shoulder cannot put
 * the hand back that way; then it may point down or out instead (`reachArm`).
 */
function holdWeaponAt(st: Start, pose: Pose, places: Partial<Places>): Pose {
  if (!places.hand && !places.point) return pose;
  const r = st.build(pose);
  if (places.hand) {
    const { at, facing } = places.hand;
    const wrist = jointPosition(r, `wrist_${st.w}`);
    // Put back if the body's move carried the hand, or it is out of its allowance.
    const carried = wrist.distanceTo(jointPosition(st.rig, `wrist_${st.w}`)) > STILL || wrist.distanceTo(at) > KEPT_WITHIN;
    let p = carried && wrist.distanceTo(at) > STILL ? reachArm(st, pose, st.w, at, undefined, facing) : pose;
    if (places.point && st.build(p).tip.distanceTo(places.point.tip) > STILL) p = safeAim(p, st.build, st.setup, places.point.tip);
    return p;
  }
  const { tip, at, facing } = places.point!;
  if (r.tip.distanceTo(tip) <= STILL) return pose;
  // Keeping the whole hand as it was keeps the point; the aim then mends what the arm cannot.
  return settlePoint(st, pose, tip, at, facing);
}

/** A kept weapon hand or point goes back where it was when the drag began. */
function holdWeapon(st: Start, pose: Pose): Pose {
  const { keep } = st;
  if (!keep.hand && !keep.point) return pose;
  return holdWeaponAt(st, pose, pick(placesOfRig(st.rig, st.w), [...(keep.hand ? (['hand'] as Kept[]) : []), ...(keep.point ? (['point'] as Kept[]) : [])]));
}

/**
 * Elbow or knee: both ends of the limb stay and it turns about the line
 * between them, so the elbow or knee comes as near `target` as it can. A
 * knee turns only as far as the foot can stay flat (the ankle cannot twist).
 */
function swivel(st: Start, limb: Limb, side: Side, target: Vector3): Pose {
  const root = jointPosition(st.rig, limb === 'arm' ? `shoulder_${side}` : `hip_${side}`);
  const end = jointPosition(st.rig, limb === 'arm' ? `wrist_${side}` : `ankle_${side}`);
  const axis = end.clone().sub(root).normalize();
  const bend = bendOf(st.rig, limb, side);
  const want = target.clone().sub(root);
  want.addScaledVector(axis, -want.dot(axis));
  if (!bend || want.lengthSq() < 1e-8) return st.pose;
  want.normalize();
  const theta = Math.atan2(new Vector3().crossVectors(bend, want).dot(axis), bend.dot(want));
  const held: Build = (p) => solveRig(st.setup, p, st.heading, st.pelvis.y);
  const at = (k: number) => reach(st.pose, held, limb, side, end, bend.clone().applyAxisAngle(axis, theta * k));
  if (limb === 'arm') return at(1);
  const ankle = `ankle_${side}` as const;
  const up0 = new Vector3(0, 1, 0).applyQuaternion(worldQ(st.rig.world[ankle]));
  const flat = (p: Pose) => new Vector3(0, 1, 0).applyQuaternion(worldQ(held(p).world[ankle])).angleTo(up0) < 1 * DEG;
  const full = at(1);
  if (flat(full)) return full;
  let lo = 0;
  let hi = 1;
  let best = st.pose;
  for (let i = 0; i < 10; i++) {
    const k = (lo + hi) / 2;
    const p = at(k);
    if (flat(p)) {
      lo = k;
      best = p;
    } else hi = k;
  }
  return best;
}

/** The point: the wrist turns first, then the hand moves by what is still missing (mostly along the blade), alternately. */
function pointTo(st: Start, target: Vector3): Pose {
  if (st.keep.hand) return safeAim(st.pose, st.build, st.setup, target);
  const wrist = `wrist_${st.w}` as const;
  let goal = jointPosition(st.rig, wrist);
  let facing = worldQ(st.rig.world[wrist]);
  let best = { pose: st.pose, miss: st.rig.tip.distanceTo(target) };
  let last = Infinity;
  for (let i = 0; i < 6; i++) {
    // The hand goes where the point needs it, with the elbow bent a way that lets the wrist keep the blade there.
    const moved = i === 0 ? st.pose : limbTo(st, 'arm', st.w, goal, facing, (q) => st.build(safeAim(q, st.build, st.setup, target)).tip.distanceTo(target));
    const p = safeAim(moved, st.build, st.setup, target);
    const r = st.build(p);
    const miss = target.clone().sub(r.tip);
    if (miss.length() < best.miss) best = { pose: p, miss: miss.length() };
    // Landed, or the arm (and body) can do no more.
    if (miss.length() < 0.001 || miss.length() > last - 0.002) break;
    last = miss.length();
    goal = jointPosition(r, wrist).add(miss);
    facing = worldQ(r.world[wrist]);
  }
  return best.pose;
}

/** Move the hips to `target`. Planted feet stay; the hips stop where the legs can no longer reach. */
function hipsTo(st: Start, target: Vector3): Pose {
  if (!st.keep.feet) return { ...st.pose, root: { ...st.pose.root, x: target.x, z: target.z } };
  const holds = footHolds(st.rig);
  const chains = plantedChains(st, holds);
  const minY = Math.min(st.pelvis.y, LOWEST_PELVIS * st.rig.layout.height);
  // Highest the pelvis can be over (x, z), or -Infinity if a leg cannot reach that far.
  const highest = (x: number, z: number) => {
    let h = Infinity;
    for (const c of chains) {
      const dx = c.from.x - st.pelvis.x + x - c.target.x;
      const dz = c.from.z - st.pelvis.z + z - c.target.z;
      const hz2 = dx * dx + dz * dz;
      if (hz2 > c.R * c.R) return -Infinity;
      h = Math.min(h, c.target.y + Math.sqrt(c.R * c.R - hz2) - c.from.y + st.pelvis.y);
    }
    return h;
  };
  const P = target.clone();
  if (!(highest(P.x, P.z) >= minY)) {
    // Too far for the legs: come back toward where the hips were until they reach.
    let a = 0;
    let b = 1;
    for (let i = 0; i < 30; i++) {
      const m = (a + b) / 2;
      const x = st.pelvis.x + (target.x - st.pelvis.x) * m;
      const z = st.pelvis.z + (target.z - st.pelvis.z) * m;
      if (highest(x, z) >= minY) a = m;
      else b = m;
    }
    P.x = st.pelvis.x + (target.x - st.pelvis.x) * a;
    P.z = st.pelvis.z + (target.z - st.pelvis.z) * a;
  }
  P.y = Math.min(Math.max(target.y, minY), highest(P.x, P.z));
  if (!Number.isFinite(P.y)) return st.pose;
  return backOff(st, holds, (k) => plantFeet(st.pose, st.setup, st.heading, st.pelvis.clone().lerp(P, k), holds), 0).pose;
}

/** World matrix of the neck (with its own turn), worked out from the pelvis up: the spine alone, without posing the whole body. */
function neckMatrix(pose: Pose, rig: Rig): Matrix4 {
  const m = rig.world.pelvis.clone();
  const one = new Vector3(1, 1, 1);
  for (const j of ['abdomen', 'chest', 'neck'] as const) {
    const [x, y, z] = rig.layout.offsets[j];
    m.multiply(new Matrix4().compose(new Vector3(x, y, z), jointRotation(pose, j), one));
  }
  return m;
}

type Dof = { joint: JointName; dof: string; weight: number };

const SPINE: Dof[] = [
  { joint: 'abdomen', dof: 'flex', weight: 1 },
  { joint: 'abdomen', dof: 'side', weight: 1 },
  { joint: 'abdomen', dof: 'turn', weight: 0.5 },
  { joint: 'chest', dof: 'flex', weight: 1 },
  { joint: 'chest', dof: 'side', weight: 1 },
  { joint: 'chest', dof: 'turn', weight: 0.5 },
];

const NECK: Dof[] = [
  { joint: 'neck', dof: 'flex', weight: 1 },
  { joint: 'neck', dof: 'side', weight: 1 },
  { joint: 'neck', dof: 'turn', weight: 1 },
];

/**
 * Turn `dofs` in small steps so `at(pose)` moves toward `target`, each step
 * the smallest turn that moves it the right way (damped least squares), as
 * `nudgeToward` in path.ts does for the arm. A movement at its limit and
 * pushing further sits the step out.
 */
function nudge(from: Pose, dofs: Dof[], at: (p: Pose) => Vector3, target: Vector3): Pose {
  const set = (p: Pose, d: Dof, v: number): Pose => ({
    ...p,
    joints: { ...p.joints, [d.joint]: { ...p.joints[d.joint], [d.dof]: clampDof(d.joint, d.dof, v) } },
  });
  const H = 0.5; // degrees, for the slopes
  const DAMP = 0.05;
  let pose = from;
  let now = at(pose);
  for (let iter = 0; iter < 40; iter++) {
    const err = target.clone().sub(now);
    if (err.length() < 0.001) break;
    if (err.length() > 0.02) err.setLength(0.02);
    // Slopes in metres per radian, scaled by how freely each movement may turn.
    const cols = dofs.map((d) => at(set(pose, d, angle(pose, d.joint, d.dof) + H)).sub(now).multiplyScalar(d.weight / (H * DEG)));
    let active = dofs.map(() => true);
    let next = pose;
    for (let pass = 0; pass < 2; pass++) {
      const m = new Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
      const e = m.elements;
      cols.forEach((col, i) => {
        if (!active[i]) return;
        const v = col.toArray();
        for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) e[k * 3 + r] += v[r] * v[k];
      });
      for (let r = 0; r < 3; r++) e[r * 4] += DAMP * DAMP;
      const y = err.clone().applyMatrix3(m.invert());
      next = pose;
      const blocked: boolean[] = [];
      dofs.forEach((d, i) => {
        if (!active[i]) return blocked.push(false);
        const v = angle(pose, d.joint, d.dof) + (cols[i].dot(y) * d.weight) / DEG;
        blocked.push(clampDof(d.joint, d.dof, v) !== v);
        next = set(next, d, v);
      });
      if (!blocked.some(Boolean)) break;
      active = active.map((a, i) => a && !blocked[i]);
    }
    const nextAt = at(next);
    if (nextAt.distanceTo(target) >= now.distanceTo(target) - 1e-5) break;
    pose = next;
    now = nextAt;
  }
  return pose;
}

function chestTo(st: Start, target: Vector3): Pose {
  return nudge(st.pose, SPINE, (p) => new Vector3().setFromMatrixPosition(neckMatrix(p, st.rig)), target);
}

function headTo(st: Start, target: Vector3): Pose {
  const H = st.rig.layout.height;
  const centre = new Vector3(0.008 * H, 0.088 * H, 0);
  return nudge(st.pose, NECK, (p) => centre.clone().applyMatrix4(neckMatrix(p, st.rig)), target);
}

function finite(pose: Pose): boolean {
  if (![pose.root.x, pose.root.z, pose.root.lift].every(Number.isFinite)) return false;
  return Object.values(pose.joints).every((a) => Object.values(a ?? {}).every((v) => v === undefined || Number.isFinite(v)));
}

/** The dot's own move, before kept things are checked. */
function dragRaw(st: Start, dot: Dot, target: Vector3): Pose {
  const { keep, setup } = st;
  switch (dot) {
    case 'hips':
      return holdWeapon(st, hipsTo(st, target));
    case 'hand_r':
    case 'hand_l': {
      const side: Side = dot === 'hand_r' ? 'r' : 'l';
      const p = limbTo(st, 'arm', side, target, worldQ(st.rig.world[`wrist_${side}`]));
      if (side !== st.w) return holdWeapon(st, p);
      // The weapon hand moves; a kept point stays by the wrist turning.
      return keep.point ? safeAim(p, st.build, setup, st.rig.tip) : p;
    }
    case 'foot_r':
    case 'foot_l': {
      const side: Side = dot === 'foot_r' ? 'r' : 'l';
      // Feet stay on or above the floor, facing as they do.
      const floor = target.clone().setY(Math.max(target.y, st.rig.layout.ankleHeight));
      return holdWeapon(st, limbTo(st, 'leg', side, floor, worldQ(st.rig.world[`ankle_${side}`])));
    }
    case 'point':
      return pointTo(st, target);
    case 'elbow_r':
    case 'elbow_l':
    case 'knee_r':
    case 'knee_l': {
      const side: Side = dot.endsWith('_r') ? 'r' : 'l';
      return swivel(st, dot.startsWith('elbow') ? 'arm' : 'leg', side, target);
    }
    case 'chest':
      return holdWeapon(st, chestTo(st, target));
    case 'head':
      return headTo(st, target);
  }
}

/**
 * Drag a dot to `target` (world space); returns the new pose. Whatever `keep`
 * names stays where it was, unless it is the dot being dragged. `pose` is the
 * pose the drag began with: a kept hand or point that the body would pull
 * out of reach stops the dot short of the pointer instead of moving. (Kept
 * feet stop the body the same way, inside each dot's own move.)
 */
export function dragDot(pose: Pose, setup: FencerSetup, heading: number, dot: Dot, target: Vector3, keep: Keep = DEFAULT_KEEP): Pose {
  if (![target.x, target.y, target.z].every(Number.isFinite)) return pose;
  const st = begin(pose, setup, heading, keep);
  const solve = (t: Vector3) => {
    const p = dragRaw(st, dot, t);
    return finite(p) ? p : pose;
  };
  const hand: Dot = `hand_${st.w}`;
  const kept: Kept[] = [...(keep.hand && dot !== hand ? (['hand'] as Kept[]) : []), ...(keep.point && dot !== 'point' ? (['point'] as Kept[]) : [])];
  if (!kept.length) return solve(target);
  const start = dotPositions(st.rig)[dot];
  return holdKept(pick(placesOfRig(st.rig, st.w), kept), pose, (k) => solve(k >= 1 ? target : start.clone().lerp(target, k)), setup, heading, 6).pose;
}

/** Which things `keep` holds through an edit of the `edited` joints: never a limb the coach is editing directly. */
export function keptThrough(setup: FencerSetup, keep: Keep, edited: readonly JointName[] = []): Kept[] {
  const w = weaponSide(setup);
  const legEdited = (s: Side) => edited.some((j) => j === `hip_${s}` || j === `knee_${s}` || j === `ankle_${s}`);
  const armEdited = edited.some((j) => j === `shoulder_${w}` || j === `elbow_${w}` || j === `wrist_${w}`);
  return [
    ...(keep.feet ? (['r', 'l'] as Side[]).filter((s) => !legEdited(s)).map((s) => `foot_${s}` as Kept) : []),
    ...(keep.hand && !armEdited ? (['hand'] as Kept[]) : []),
    ...(keep.point && !armEdited && !edited.includes('grip') ? (['point'] as Kept[]) : []),
  ];
}

/**
 * Re-solve the limbs so the things in `places` are back where it has them,
 * after an edit made `after`. The pelvis stays where the edit put it, at the
 * height it had in `base`, sinking only while that lets a leg reach its foot.
 */
function solveKeeps(places: Partial<Places>, base: Pose, after: Pose, setup: FencerSetup, heading: number): Pose {
  const st = begin(base, setup, heading, { feet: false, hand: !!places.hand, point: !!places.point });
  let pose = after;
  let r = st.build(after);

  const holds = [places.foot_r, places.foot_l].filter((f): f is FootHold => !!f);
  // Feet are put back only if this edit moved one (or one is out of its
  // allowance): an edit elsewhere on the body leaves the legs exactly alone.
  const slipped = holds.some((f) => {
    const a = `ankle_${f.side}` as const;
    const now = jointPosition(r, a);
    const moved = now.distanceTo(jointPosition(st.rig, a)) > STILL || worldQ(r.world[a]).angleTo(worldQ(st.rig.world[a])) > 0.002;
    return moved || now.distanceTo(f.at) > KEPT_WITHIN;
  });
  if (slipped) {
    // The pelvis stays where it was (it may have turned or leant, or slid if
    // the edit moved it), sinking only if a leg can no longer reach its foot.
    const pelvis = jointPosition(r, 'pelvis');
    const L = r.layout;
    const len = L.thigh + L.shank;
    let y = st.pelvis.y;
    let reachable = true;
    for (const f of holds) {
      const hip = jointPosition(r, `hip_${f.side}`).sub(pelvis);
      const dx = after.root.x + hip.x - f.at.x;
      const dz = after.root.z + hip.z - f.at.z;
      const hz2 = dx * dx + dz * dz;
      const R = Math.max(len - LEG_SLACK, Math.min(len - 1e-4, jointPosition(st.rig, `hip_${f.side}`).distanceTo(f.at) + 1e-6));
      if (hz2 > R * R) reachable = false;
      else y = Math.min(y, f.at.y + Math.sqrt(R * R - hz2) - hip.y);
    }
    if (reachable) y = Math.max(y, Math.min(st.pelvis.y, LOWEST_PELVIS * L.height));
    else y = st.pelvis.y;
    pose = plantFeet(after, setup, heading, new Vector3(after.root.x, y, after.root.z), holds);
    // An edited leg left as it is may now reach below the held feet (a bent
    // knee tips its toes down) and so lift the fencer off them: raise the
    // pelvis by as much, so those toes rest on the floor and the held feet stay.
    for (let i = 0; i < 3; i++) {
      r = st.build(pose);
      const lift = holds.reduce((sum, f) => sum + jointPosition(r, `ankle_${f.side}`).y - f.at.y, 0) / holds.length;
      if (Math.abs(lift) < 0.001) break;
      y += lift;
      pose = plantFeet(after, setup, heading, new Vector3(after.root.x, y, after.root.z), holds);
    }
  }
  return holdWeaponAt(st, pose, places);
}

/**
 * An edit that was not a drag (a key, a typed angle, Straighten) took the
 * fencer from `before` to `after`. Keep the things in `places` where it has
 * them: if all of the edit would pull one out of reach, only as much of the
 * edit as keeps them is applied (joint angle by joint angle), and `cut` says
 * so. `places` are where those things should stay, which may be where they
 * were several edits ago: that is what stops a held key from walking a kept
 * foot away a little at a time.
 */
export function editKept(places: Partial<Places>, before: Pose, after: Pose, setup: FencerSetup, heading: number): { pose: Pose; cut: boolean } {
  if (!Object.keys(places).length) return { pose: after, cut: false };
  return holdKept(places, before, (k) => solveKeeps(places, before, k >= 1 ? after : tweenPose(before, after, k), setup, heading), setup, heading);
}

/**
 * After an edit that was not a drag (a key, a typed angle): put back whatever
 * `keep` names, taking their places from `before`. A limb containing one of
 * the `edited` joints is left alone, so bending a knee by hand is never
 * undone by its own foot being kept. If the edit would pull a kept thing out
 * of reach, the edit stops short instead.
 */
export function keepInPlace(before: Pose, after: Pose, setup: FencerSetup, heading: number, keep: Keep, edited: JointName[] = []): Pose {
  const kept = keptThrough(setup, keep, edited);
  if (!kept.length) return after;
  return editKept(pick(placesOf(before, setup, heading), kept), before, after, setup, heading).pose;
}

/**
 * Slide the whole fencer along (and across) the piste. The feet travel with
 * the fencer, as a step must; a kept weapon hand or point stays in `places`
 * (by default where it is on `pose`), the arm re-solving, and the slide stops
 * short if the arm cannot manage it.
 */
export function slideFencer(
  pose: Pose,
  setup: FencerSetup,
  heading: number,
  x: number,
  z: number,
  keep: Keep,
  places?: Partial<Places>,
): { pose: Pose; cut: boolean } {
  const to: Pose = { ...pose, root: { ...pose.root, x, z } };
  const kept: Kept[] = [...(keep.hand ? (['hand'] as Kept[]) : []), ...(keep.point ? (['point'] as Kept[]) : [])];
  if (!kept.length) return { pose: to, cut: false };
  return editKept(pick(places ?? placesOf(pose, setup, heading), kept), pose, to, setup, heading);
}
