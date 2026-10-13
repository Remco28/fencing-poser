import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { JOINT_BY_NAME, JOINTS, type JointName } from '../model/joints.ts';
import { angle, type FencerSetup, type Pose } from '../model/types.ts';
import { EPEE, layoutFor, type Layout } from './layout.ts';

const DEG = Math.PI / 180;

export interface Rig {
  layout: Layout;
  /** World matrix of every joint (the grip is the épée's frame). */
  world: Record<JointName, Matrix4>;
  /** Épée point in world space. */
  tip: Vector3;
  /** Where the blade leaves the guard, in world space. */
  guard: Vector3;
}

const BODY_JOINTS = JOINTS.filter((j) => j.name !== 'grip');

/** Local rotation of one joint from its anatomical angles. */
export function jointRotation(pose: Pose, name: JointName, flipX = 1): Quaternion {
  const def = JOINT_BY_NAME[name];
  const r = { x: 0, y: 0, z: 0 };
  for (const dof of def.dofs) {
    r[dof.axis] += angle(pose, name, dof.key) * dof.sign * DEG;
  }
  return new Quaternion().setFromEuler(new Euler(r.x * flipX, r.y, r.z, def.order));
}

/**
 * Pose the mannequin. `heading` is the direction the fencer's body faces before
 * any pelvis turn, in degrees (0 = +X along the piste, 180 = -X). Normally the
 * fencer is set down on the floor; `pelvisY` instead holds the pelvis at that
 * height, which drag-to-pose uses to work out what the legs must do.
 */
export function solveRig(setup: FencerSetup, pose: Pose, heading = 0, pelvisY?: number): Rig {
  const layout = layoutFor(setup);
  const world = {} as Record<JointName, Matrix4>;

  const base = new Matrix4().compose(
    new Vector3(pose.root.x, 0, pose.root.z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading * DEG),
    new Vector3(1, 1, 1),
  );

  for (const def of BODY_JOINTS) {
    const parent = def.parent ? world[def.parent] : base;
    const [ox, oy, oz] = layout.offsets[def.name as Exclude<JointName, 'grip'>];
    const local = new Matrix4().compose(new Vector3(ox, oy, oz), jointRotation(pose, def.name), new Vector3(1, 1, 1));
    world[def.name] = new Matrix4().multiplyMatrices(parent, local);
  }

  // The épée pivots in the weapon hand. The palm faces the other way on the
  // left hand, so the palm-ward angle flips with it.
  const weaponWrist: JointName = setup.handedness === 'right' ? 'wrist_r' : 'wrist_l';
  const gripLocal = new Matrix4().makeRotationFromQuaternion(
    jointRotation(withGripDefaults(setup, pose), 'grip', setup.handedness === 'right' ? 1 : -1),
  );
  world.grip = new Matrix4().multiplyMatrices(world[weaponWrist], gripLocal);

  // Set the fencer down so the lowest foot touches the floor.
  const lowest = Math.min(...soleCorners(layout, world).map((p) => p.y));
  const drop = new Matrix4().makeTranslation(0, pelvisY ?? pose.root.lift - lowest, 0);
  for (const name of Object.keys(world) as JointName[]) world[name].premultiply(drop);

  return {
    layout,
    world,
    guard: new Vector3(0, -EPEE.wristToGuard, 0).applyMatrix4(world.grip),
    tip: new Vector3(0, -EPEE.wristToGuard - EPEE.blade, 0).applyMatrix4(world.grip),
  };
}

/** A pistol grip holds the point a little toward the thumb even with a straight wrist. */
function withGripDefaults(setup: FencerSetup, pose: Pose): Pose {
  if (setup.grip !== 'pistol') return pose;
  const grip = pose.joints.grip ?? {};
  return { ...pose, joints: { ...pose.joints, grip: { ...grip, tilt: (grip.tilt ?? 0) + PISTOL_TILT } } };
}

export const PISTOL_TILT = 10;

/** The four corners of each sole, in world space. */
export function soleCorners(layout: Layout, world: Record<JointName, Matrix4>): Vector3[] {
  const y = -layout.ankleHeight;
  const w = layout.footWidth / 2;
  const corners: Vector3[] = [];
  for (const ankle of ['ankle_r', 'ankle_l'] as const) {
    for (const x of [-layout.heel, layout.toe]) {
      for (const z of [-w, w]) corners.push(new Vector3(x, y, z).applyMatrix4(world[ankle]));
    }
  }
  return corners;
}

export function jointPosition(rig: Rig, name: JointName): Vector3 {
  return new Vector3().setFromMatrixPosition(rig.world[name]);
}

/** A direction in a joint's local frame, turned into world space. */
export function jointAxis(rig: Rig, name: JointName, local: [number, number, number]): Vector3 {
  const q = new Quaternion();
  rig.world[name].decompose(new Vector3(), q, new Vector3());
  return new Vector3(...local).applyQuaternion(q);
}

/**
 * Where the thumb points, as a clock position seen from behind the hand
 * looking toward the point (12 = up, 3 = to the right). Coaches describe
 * pronation and supination this way: sixte is about 1 o'clock for a
 * right-hander, quarte nearer 2 or 3, seconde about 9.
 */
export function thumbClock(rig: Rig, side: 'r' | 'l', weapon: boolean): { hour: number; degrees: number } {
  const wrist = `wrist_${side}` as const;
  const along = weapon ? rig.tip.clone().sub(rig.guard).normalize() : jointAxis(rig, wrist, [0, -1, 0]);
  const up = new Vector3(0, 1, 0).addScaledVector(along, -along.y);
  if (up.lengthSq() < 1e-6) up.set(1, 0, 0).addScaledVector(along, -along.x);
  up.normalize();
  const right = new Vector3().crossVectors(along, up);
  const thumb = jointAxis(rig, wrist, [1, 0, 0]);
  const degrees = ((Math.atan2(thumb.dot(right), thumb.dot(up)) * 180) / Math.PI + 360) % 360;
  const hour = Math.round(degrees / 30) % 12 || 12;
  return { hour, degrees };
}
