import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clampDof, JOINT_BY_NAME, type JointName, type Side } from '../model/joints.ts';
import type { FencerSetup, JointAngles, Pose } from '../model/types.ts';
import { solveRig, type Rig } from '../rig/kinematics.ts';

// Drag-to-pose. Arms and legs are two-bone chains with an exact solution: the
// law of cosines places the elbow or knee, a "pole" says which way it points,
// and the result is turned back into anatomical angles, clamped to the joint
// limits. The hand or foot keeps the orientation it had, so a dragged hand
// keeps its blade on line and a dragged foot stays flat.

const DEG = Math.PI / 180;

export type Limb = 'arm' | 'leg';
export type Handle = 'hand_r' | 'hand_l' | 'foot_r' | 'foot_l' | 'hips' | 'point';

type Build = (pose: Pose) => Rig;

const CHAIN = {
  arm: { root: 'shoulder', mid: 'elbow', end: 'wrist', upper: 'upperArm', lower: 'forearm', bend: 1 },
  leg: { root: 'hip', mid: 'knee', end: 'ankle', upper: 'thigh', lower: 'shank', bend: -1 },
} as const;

function worldQ(m: Matrix4): Quaternion {
  const q = new Quaternion();
  m.decompose(new Vector3(), q, new Vector3());
  return q;
}

function worldP(m: Matrix4): Vector3 {
  return new Vector3().setFromMatrixPosition(m);
}

/** Anatomical angles that give `local` as the joint's rotation in its parent's frame. */
export function anglesFor(joint: JointName, local: Quaternion): JointAngles {
  const def = JOINT_BY_NAME[joint];
  const e = new Euler().setFromQuaternion(local, def.order);
  const out: JointAngles = {};
  for (const d of def.dofs) out[d.key] = clampDof(joint, d.key, e[d.axis] / d.sign / DEG);
  return out;
}

function setJoint(pose: Pose, joint: JointName, angles: JointAngles): Pose {
  return { ...pose, joints: { ...pose.joints, [joint]: { ...pose.joints[joint], ...angles } } };
}

/**
 * Bend a limb so its hand or foot reaches `target` (world space). `pole` is
 * the direction the elbow or knee should point; by default it keeps pointing
 * where it does now.
 */
export function reach(pose: Pose, build: Build, limb: Limb, side: Side, target: Vector3, pole?: Vector3): Pose {
  const c = CHAIN[limb];
  const root = `${c.root}_${side}` as JointName;
  const mid = `${c.mid}_${side}` as JointName;
  const end = `${c.end}_${side}` as JointName;
  const rig = build(pose);
  const a = worldP(rig.world[root]);
  const L1 = rig.layout[c.upper];
  const L2 = rig.layout[c.lower];

  const toTarget = target.clone().sub(a);
  const dist = Math.min(Math.max(toTarget.length(), Math.abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4);
  const dir = toTarget.normalize();
  const t = a.clone().addScaledVector(dir, dist);

  const currentX = new Vector3(1, 0, 0).applyQuaternion(worldQ(rig.world[root]));
  const bendDir = (pole ?? worldP(rig.world[mid]).sub(a)).clone();
  bendDir.addScaledVector(dir, -bendDir.dot(dir));
  if (bendDir.lengthSq() < 1e-8) bendDir.copy(currentX).multiplyScalar(-c.bend).addScaledVector(dir, -currentX.dot(dir) * -c.bend);
  bendDir.normalize();

  const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const m = a.clone().addScaledVector(dir, L1 * cosA).addScaledVector(bendDir, L1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  const upper = m.clone().sub(a).normalize();
  const lower = t.clone().sub(m).normalize();

  // The joint's local -Y runs down the upper segment; the lower segment bends
  // toward +X at the elbow and toward -X at the knee.
  const y = upper.clone().negate();
  const x = lower.clone().addScaledVector(upper, -lower.dot(upper));
  if (x.lengthSq() < 1e-8) x.copy(currentX).addScaledVector(upper, -currentX.dot(upper));
  else x.multiplyScalar(c.bend);
  x.normalize();
  const z = new Vector3().crossVectors(x, y);
  const rootWorld = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));

  const parent = JOINT_BY_NAME[root].parent!;
  let next = setJoint(pose, root, anglesFor(root, worldQ(rig.world[parent]).invert().multiply(rootWorld)));
  next = setJoint(next, mid, { flex: clampDof(mid, 'flex', Math.acos(Math.min(1, Math.max(-1, upper.dot(lower)))) / DEG) });

  // Keep the hand or foot facing the way it did.
  const endWorld = worldQ(rig.world[end]);
  const midWorld = worldQ(build(next).world[mid]);
  return setJoint(next, end, anglesFor(end, midWorld.invert().multiply(endWorld)));
}

/** Turn the weapon hand so the point aims at `target`. */
export function aim(pose: Pose, build: Build, setup: FencerSetup, target: Vector3): Pose {
  const side: Side = setup.handedness === 'right' ? 'r' : 'l';
  const wrist = `wrist_${side}` as JointName;
  const rig = build(pose);
  const w = worldP(rig.world[wrist]);
  const from = rig.tip.clone().sub(w).normalize();
  const to = target.clone().sub(w).normalize();
  const hand = new Quaternion().setFromUnitVectors(from, to).multiply(worldQ(rig.world[wrist]));
  const elbow = worldQ(rig.world[`elbow_${side}`]);
  return setJoint(pose, wrist, anglesFor(wrist, elbow.invert().multiply(hand)));
}

/**
 * Move the hips to `target` with both feet staying where they are: the legs
 * bend or straighten to make it so.
 */
export function moveHips(pose: Pose, setup: FencerSetup, heading: number, target: Vector3): Pose {
  const before = solveRig(setup, pose, heading);
  const feet = (['r', 'l'] as const).map((s) => ({
    side: s,
    at: worldP(before.world[`ankle_${s}`]),
    forward: new Vector3(1, 0, 0).applyQuaternion(worldQ(before.world[`ankle_${s}`])),
  }));
  const held: Build = (p) => solveRig(setup, p, heading, target.y);
  let next: Pose = { ...pose, root: { ...pose.root, x: target.x, z: target.z } };
  for (const foot of feet) next = reach(next, held, 'leg', foot.side, foot.at, foot.forward);
  return next;
}

/** Where each handle sits on the posed fencer. */
export function handlePositions(rig: Rig): Record<Handle, Vector3> {
  return {
    hand_r: worldP(rig.world.wrist_r),
    hand_l: worldP(rig.world.wrist_l),
    foot_r: worldP(rig.world.ankle_r),
    foot_l: worldP(rig.world.ankle_l),
    hips: worldP(rig.world.pelvis),
    point: rig.tip.clone(),
  };
}

/** Drag a handle to a point in world space; returns the new pose. */
export function dragHandle(pose: Pose, setup: FencerSetup, heading: number, handle: Handle, target: Vector3): Pose {
  const build: Build = (p) => solveRig(setup, p, heading);
  switch (handle) {
    case 'hand_r':
    case 'hand_l':
      return reach(pose, build, 'arm', handle === 'hand_r' ? 'r' : 'l', target);
    case 'foot_r':
    case 'foot_l': {
      const side = handle === 'foot_r' ? 'r' : 'l';
      const rig = build(pose);
      // Feet stay on or above the floor; the knee points over the toes.
      const floor = target.clone().setY(Math.max(target.y, rig.layout.ankleHeight));
      const forward = new Vector3(1, 0, 0).applyQuaternion(worldQ(rig.world[`ankle_${side}`]));
      return reach(pose, build, 'leg', side, floor, forward);
    }
    case 'hips':
      return moveHips(pose, setup, heading, target);
    case 'point':
      return aim(pose, build, setup, target);
  }
}
