import type { Pose } from '../model/types.ts';
import { FITTED } from './fitted.ts';

export type PresetGroup = 'footwork' | 'parries' | 'body' | 'mine';

export const GROUP_NAMES: Record<PresetGroup, string> = {
  footwork: 'Stance and footwork',
  parries: 'Parries',
  body: 'Body',
  mine: 'My poses',
};

export interface PresetPose {
  id: string;
  name: string;
  builtIn: boolean;
  /** Where it is listed; the coach's own presets go under "My poses". */
  group?: PresetGroup;
  /** Authored right-handed, facing +X; mirrored when applied to a left-hander. */
  pose: Pose;
  /** When the coach last changed it; built-ins as shipped have none. */
  updatedAt?: string;
}

const origin = { x: 0, z: 0, lift: 0 };

function fitted(id: string, name: string, group: PresetGroup): PresetPose {
  return { id, name, group, builtIn: true, pose: { root: origin, joints: FITTED[id] } };
}

// Angles come from tools/fit-pose.ts, which solves each pose from fencing
// targets (feet on the line, point at the opponent, thumb in or out).
export const BUILT_IN_PRESETS: PresetPose[] = [
  {
    id: 'stand',
    name: 'Standing',
    group: 'footwork',
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
  fitted('en-garde', 'En garde', 'footwork'),
  fitted('advance', 'Advance (mid-step)', 'footwork'),
  fitted('retreat', 'Retreat (mid-step)', 'footwork'),
  fitted('extension', 'Extension', 'footwork'),
  fitted('lunge', 'Lunge', 'footwork'),
  fitted('fleche', 'Flèche', 'footwork'),
  fitted('parry-1', 'Prime (1)', 'parries'),
  fitted('parry-2', 'Seconde (2)', 'parries'),
  fitted('parry-3', 'Tierce (3)', 'parries'),
  fitted('parry-4', 'Quarte (4)', 'parries'),
  fitted('parry-6', 'Sixte (6)', 'parries'),
  fitted('parry-7', 'Septime (7)', 'parries'),
  fitted('parry-8', 'Octave (8)', 'parries'),
  fitted('stomach-tuck', 'Stomach tuck', 'body'),
  fitted('lean-back', 'Lean back', 'body'),
];
