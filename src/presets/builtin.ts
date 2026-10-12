import type { Pose } from '../model/types.ts';

export interface PresetPose {
  id: string;
  name: string;
  builtIn: boolean;
  /** Authored right-handed, facing +X; mirrored when applied to a left-hander. */
  pose: Pose;
  /** When the coach last changed it; built-ins as shipped have none. */
  updatedAt?: string;
}

const origin = { x: 0, z: 0, lift: 0 };

// Generated with `node tools/fit-pose.ts <name>`, then rounded.
export const BUILT_IN_PRESETS: PresetPose[] = [
  {
    id: 'stand',
    name: 'Standing',
    builtIn: true,
    pose: {
      root: origin,
      joints: {
        shoulder_r: { abduct: 8 },
        shoulder_l: { abduct: 8 },
        elbow_r: { flex: 10 },
        elbow_l: { flex: 10 },
        hip_r: { abduct: 4, twist: 10 },
        hip_l: { abduct: 4, twist: 10 },
      },
    },
  },
  {
    id: 'en-garde',
    name: 'En garde',
    builtIn: true,
    pose: {
      root: origin,
      joints: {
        pelvis: { turn: -45, lean: -4, side: 4 },
        abdomen: { turn: 1 },
        chest: { turn: -5 },
        neck: { turn: 46, flex: 1, side: -5 },
        shoulder_r: { flex: 6, abduct: 12, twist: 32 },
        elbow_r: { flex: 83 },
        wrist_r: { pronate: -19, flex: -12, deviate: -5 },
        shoulder_l: { abduct: 48, twist: 56, flex: 34 },
        elbow_l: { flex: 112 },
        hip_r: { flex: 32, twist: 33, abduct: 27 },
        knee_r: { flex: 46 },
        ankle_r: { flex: 4, roll: -3 },
        hip_l: { flex: -4, abduct: 16, twist: 28 },
        knee_l: { flex: 40 },
        ankle_l: { flex: 30, roll: 18 },
      },
    },
  },
];
