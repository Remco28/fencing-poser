import { Vector3 } from 'three';
import { footHolds, plantFeet, type FootHold } from '../ik/ik.ts';
import type { JointName } from '../model/joints.ts';
import type { FencerSetup, Pose } from '../model/types.ts';
import { jointPosition, solveRig } from '../rig/kinematics.ts';

// Footwork between two steps. Turning every joint evenly from one pose to the
// next makes feet skate: both slide along the floor at once, and a foot that
// should stand still drifts as the hips move. Here the feet are placed first,
// the way a fencer steps, and the legs are bent to suit:
//   - a foot that ends where it began stays planted;
//   - when both feet travel (an advance, a retreat), they go one at a time,
//     the leading foot first, each lifting a little off the floor;
//   - when one foot travels (a lunge, a recovery), it swings across the move;
//   - the hips travel smoothly, sinking if a leg could not otherwise reach.
// Nothing here is saved: it is how the move between two poses is shown.

type Side = 'r' | 'l';
const SIDES: readonly Side[] = ['r', 'l'];

/** A foot that travels less than this is not stepping: it stays down and is slid or turned on the spot. */
const STEPS_FROM = 0.02;
/** ...and so is one that travels much less than the other foot (the back foot dragged a little in a lunge). */
const STEPS_FROM_SHARE = 0.4;
/** An ankle higher than this above where it rests is off the floor: that leg is left as posed. */
const OFF_FLOOR = 0.07;
/** How high a stepping foot lifts: this much of its travel, at most `LIFT_MOST` metres. */
const LIFT_SHARE = 0.25;
const LIFT_MOST = 0.05;
const LEG_SLACK = 0.004;

const LEGS: JointName[] = ['pelvis', 'hip_r', 'knee_r', 'ankle_r', 'hip_l', 'knee_l', 'ankle_l'];

interface End {
  setup: FencerSetup;
  heading: number;
  pelvisY: number;
  holds: Record<Side, FootHold>;
  grounded: Record<Side, boolean>;
}

/** What is needed of a step's pose, worked out once: poses are replaced, never changed in place. */
const ends = new WeakMap<Pose, End>();

function endOf(setup: FencerSetup, heading: number, pose: Pose): End {
  const known = ends.get(pose);
  if (known && known.setup === setup && known.heading === heading) return known;
  const rig = solveRig(setup, pose, heading);
  const [r, l] = footHolds(rig, SIDES);
  const down = (h: FootHold) => h.at.y < rig.layout.ankleHeight + OFF_FLOOR;
  const end: End = { setup, heading, pelvisY: jointPosition(rig, 'pelvis').y, holds: { r, l }, grounded: { r: down(r), l: down(l) } };
  ends.set(pose, end);
  return end;
}

const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (u: number) => u * u * (3 - 2 * u);
const sameLegs = (a: Pose, b: Pose) =>
  a.root.x === b.root.x && a.root.z === b.root.z && LEGS.every((j) => JSON.stringify(a.joints[j] ?? {}) === JSON.stringify(b.joints[j] ?? {}));

/**
 * The pose `k` (0 to 1, already eased) of the way from `a` to `b`, with the
 * feet stepping. `natural` is the plain in-between pose: everything above the
 * legs is taken from it unchanged.
 */
export function stepping(setup: FencerSetup, heading: number, a: Pose, b: Pose, natural: Pose, k: number): Pose {
  if (k <= 0 || k >= 1) return natural;
  // In the air at either end (a jump, a flèche off the floor): left as posed.
  if (a.root.lift > 0 || b.root.lift > 0) return natural;
  // Legs and place the same at both ends: nothing to step.
  if (sameLegs(a, b)) return natural;
  const A = endOf(setup, heading, a);
  const B = endOf(setup, heading, b);
  const sides = SIDES.filter((s) => A.grounded[s] && B.grounded[s]);
  if (!sides.length) return natural;

  const travel = (s: Side) => flat(A.holds[s].at, B.holds[s].at);
  const most = Math.max(...sides.map(travel));
  const steppers = sides.filter((s) => travel(s) > STEPS_FROM && travel(s) >= most * STEPS_FROM_SHARE);
  // Two feet stepping go one after the other: the leading foot first.
  let first: Side | null = null;
  if (steppers.length === 2) {
    const fwd = heading === 0 ? 1 : -1;
    const ahead = (e: End): Side => (e.holds.r.at.x * fwd >= e.holds.l.at.x * fwd ? 'r' : 'l');
    const front = ahead(A);
    const rear: Side = front === 'r' ? 'l' : 'r';
    const forward = (B.holds.r.at.x - A.holds.r.at.x + B.holds.l.at.x - A.holds.l.at.x) * fwd > 0;
    // Feet that cross (a cross-step, a flèche): the one that travels further leads.
    first = ahead(B) !== front ? (travel('r') >= travel('l') ? 'r' : 'l') : forward ? front : rear;
  }

  const feet: FootHold[] = sides.map((s) => {
    const from = A.holds[s];
    const to = B.holds[s];
    let u = k;
    let lift = 0;
    if (steppers.includes(s)) {
      if (first) {
        const u0 = Math.min(1, Math.max(0, s === first ? k * 2 : k * 2 - 1));
        u = smooth(u0);
        lift = Math.sin(Math.PI * u0);
      } else {
        lift = Math.sin(Math.PI * k);
      }
      lift *= Math.min(LIFT_MOST, travel(s) * LIFT_SHARE);
    }
    const at = from.at.clone().lerp(to.at, u);
    at.y += lift;
    const pole = from.pole && to.pole ? from.pole.clone().lerp(to.pole, k) : (to.pole ?? from.pole);
    return { side: s, at, facing: from.facing.clone().slerp(to.facing, u), pole };
  });

  // The hips: where the plain move has them, at a height that goes evenly
  // from one pose's to the other's, lower if a leg could not reach its foot.
  const pelvis = new Vector3(natural.root.x, A.pelvisY + (B.pelvisY - A.pelvisY) * k, natural.root.z);
  const rig = solveRig(setup, natural, heading, pelvis.y);
  const reach = rig.layout.thigh + rig.layout.shank - LEG_SLACK;
  let sink = 0;
  for (const f of feet) {
    const hip = jointPosition(rig, `hip_${f.side}`);
    const across = flat(hip, f.at);
    if (across >= reach) continue;
    sink = Math.max(sink, hip.y - (f.at.y + Math.sqrt(reach * reach - across * across)));
  }
  pelvis.y -= Math.min(sink, pelvis.y * 0.5);
  return plantFeet(natural, setup, heading, pelvis, feet);
}
