import { Vector3 } from 'three';
import type { JointName } from '../model/joints.ts';
import { jointPosition, soleCorners, type Rig } from './kinematics.ts';

// Is the fencer balanced? The centre of mass is the weighted average of the
// body's segments (fractions of body mass after Winter's anthropometric
// tables); the fencer is balanced while it lies over the area the feet on the
// floor cover. The app only warns: some actions, a flèche above all, are off
// balance on purpose.

type Point = [JointName, [number, number, number]];

/** Each segment's share of body mass and where its centre is, in a joint's frame (fractions of height). */
function segments(rig: Rig): [number, Vector3][] {
  const H = rig.layout.height;
  const at = ([joint, [x, y, z]]: Point) => new Vector3(x * H, y * H, z * H).applyMatrix4(rig.world[joint]);
  const mid = (a: JointName, b: JointName) => jointPosition(rig, a).lerp(jointPosition(rig, b), 0.5);
  const list: [number, Vector3][] = [
    [0.081, at(['neck', [0.005, 0.07, 0]])],
    [0.142, jointPosition(rig, 'pelvis')],
    [0.139, at(['abdomen', [0, 0.055, 0]])],
    [0.216, at(['chest', [0, 0.07, 0]])],
  ];
  for (const s of ['r', 'l'] as const) {
    list.push(
      [0.028, mid(`shoulder_${s}`, `elbow_${s}`)],
      [0.016, mid(`elbow_${s}`, `wrist_${s}`)],
      [0.006, at([`wrist_${s}`, [0, -0.03, 0]])],
      [0.1, mid(`hip_${s}`, `knee_${s}`)],
      [0.0465, mid(`knee_${s}`, `ankle_${s}`)],
      [0.0145, at([`ankle_${s}`, [0.04, -0.02, 0]])],
    );
  }
  return list;
}

export function centreOfMass(rig: Rig): Vector3 {
  const sum = new Vector3();
  let mass = 0;
  for (const [m, p] of segments(rig)) {
    sum.addScaledVector(p, m);
    mass += m;
  }
  return sum.divideScalar(mass);
}

type P2 = [number, number];

/** Convex hull of points on the floor (x, z), anticlockwise. */
function hull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** How far a point is outside a convex polygon (0 or less = inside). */
function outsideBy(p: P2, poly: P2[]): number {
  if (poly.length < 3) return Math.min(...poly.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
  let worst = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    // Distance to the right of edge a→b; positive means outside an anticlockwise hull.
    const d = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / len;
    worst = Math.max(worst, d);
  }
  return worst;
}

export interface Balance {
  /** The centre of mass, and its shadow on the floor. */
  centre: Vector3;
  ground: Vector3;
  /** Metres outside the area under the feet; 0 when balanced. */
  outside: number;
}

/**
 * A foot whose sole is within this height of the floor counts as support: a
 * foot caught mid-step is about to land, and warning on every step would be
 * noise. A foot lifted higher (the back leg of a flèche) does not count.
 */
const SUPPORTING = 0.2;
/** Leeway before warning, so a centre right on the edge does not flicker. */
const LEEWAY = 0.02;

export function balanceOf(rig: Rig): Balance {
  const centre = centreOfMass(rig);
  const corners = soleCorners(rig.layout, rig.world);
  // soleCorners lists four corners per foot, right foot first.
  const feet = [corners.slice(0, 4), corners.slice(4, 8)]
    .filter((foot) => Math.min(...foot.map((c) => c.y)) < SUPPORTING)
    .flat()
    .map((c): P2 => [c.x, c.z]);
  const out = feet.length ? outsideBy([centre.x, centre.z], hull(feet)) : Infinity;
  return { centre, ground: new Vector3(centre.x, 0.004, centre.z), outside: out > LEEWAY ? out : 0 };
}
