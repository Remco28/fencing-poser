import type { JointName } from '../model/joints.ts';
import type { FencerSetup } from '../model/types.ts';

// Body proportions as fractions of standing height (after Drillis & Contini),
// simplified for a mannequin. Lengths scale with height; widths and girth also
// scale with build.

export type Vec3 = [number, number, number];

export interface Layout {
  height: number;
  /** Where each joint sits in its parent's frame at rest. Pelvis is relative to the root. */
  offsets: Record<Exclude<JointName, 'grip'>, Vec3>;
  /** Segment lengths, metres. */
  upperArm: number;
  forearm: number;
  hand: number;
  fist: number;
  thigh: number;
  shank: number;
  /** Ankle joint to sole. */
  ankleHeight: number;
  heel: number;
  toe: number;
  footWidth: number;
  build: number;
}

export function layoutFor(setup: Pick<FencerSetup, 'height' | 'build'>): Layout {
  const H = setup.height;
  const b = setup.build;
  const upperArm = 0.186 * H;
  const forearm = 0.146 * H;
  const thigh = 0.245 * H;
  const shank = 0.246 * H;
  return {
    height: H,
    build: b,
    offsets: {
      pelvis: [0, 0, 0],
      abdomen: [0, 0.05 * H, 0],
      chest: [0, 0.11 * H, 0],
      neck: [0, 0.125 * H, 0],
      shoulder_r: [0, 0.098 * H, 0.105 * H * b],
      shoulder_l: [0, 0.098 * H, -0.105 * H * b],
      elbow_r: [0, -upperArm, 0],
      elbow_l: [0, -upperArm, 0],
      wrist_r: [0, -forearm, 0],
      wrist_l: [0, -forearm, 0],
      hip_r: [0, -0.03 * H, 0.052 * H * b],
      hip_l: [0, -0.03 * H, -0.052 * H * b],
      knee_r: [0, -thigh, 0],
      knee_l: [0, -thigh, 0],
      ankle_r: [0, -shank, 0],
      ankle_l: [0, -shank, 0],
    },
    upperArm,
    forearm,
    hand: 0.108 * H,
    fist: 0.062 * H,
    thigh,
    shank,
    ankleHeight: 0.039 * H,
    heel: 0.035 * H,
    toe: 0.117 * H,
    footWidth: 0.055 * H,
  };
}

/** Real épée dimensions (metres). These do not scale with the fencer. */
export const EPEE = {
  blade: 0.9,
  guardRadius: 0.0675,
  guardDepth: 0.04,
  /** From the wrist joint to where the blade leaves the guard. */
  wristToGuard: 0.13,
};
