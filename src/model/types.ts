import type { JointName } from './joints.ts';

/** Anatomical angles in degrees, keyed by DOF name (see the joint table). Missing = 0. */
export type JointAngles = Partial<Record<string, number>>;

export interface Pose {
  /**
   * Where the body stands, in metres on the piste. Height is not stored: the
   * fencer is always set down so the lowest foot touches the floor, and `lift`
   * raises them off it (a flèche in the air).
   */
  root: { x: number; z: number; lift: number };
  joints: Partial<Record<JointName, JointAngles>>;
}

export type Handedness = 'right' | 'left';
export type Grip = 'pistol' | 'french';

export interface FencerSetup {
  /** Metres. */
  height: number;
  /** Width and girth multiplier: 0.85 slight to 1.2 broad. */
  build: number;
  handedness: Handedness;
  grip: Grip;
}

export function emptyPose(): Pose {
  return { root: { x: 0, z: 0, lift: 0 }, joints: {} };
}

export function angle(pose: Pose, joint: JointName, dof: string): number {
  return pose.joints[joint]?.[dof] ?? 0;
}

export const DEFAULT_SETUP: FencerSetup = {
  height: 1.78,
  build: 1,
  handedness: 'right',
  grip: 'pistol',
};
