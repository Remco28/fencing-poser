import { JOINT_NAMES, type JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import type { Handedness, Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS, type PresetPose } from './builtin.ts';

export interface ShownPreset extends PresetPose {
  /** A built-in preset the coach has changed; it can be restored. */
  modified: boolean;
}

/**
 * The presets the coach sees: built-ins (their edited copy if there is one),
 * then their own. Built-ins added by a later version of the app appear on
 * their own, because saved data only ever holds what the coach changed.
 */
export function shownPresets(saved: PresetPose[]): ShownPreset[] {
  const byId = new Map(saved.map((p) => [p.id, p]));
  const builtIns = BUILT_IN_PRESETS.map((p) => {
    const edit = byId.get(p.id);
    return edit ? { ...edit, builtIn: true, modified: true } : { ...p, modified: false };
  });
  const builtInIds = new Set(BUILT_IN_PRESETS.map((p) => p.id));
  const custom = saved.filter((p) => !builtInIds.has(p.id)).map((p) => ({ ...p, builtIn: false, modified: false }));
  return [...builtIns, ...custom];
}

/** Presets are stored right-handed and standing at the origin, whoever they were made on. */
export function presetPoseFrom(pose: Pose, handedness: Handedness): Pose {
  const shaped = handedness === 'left' ? mirrorPose(pose) : pose;
  return { root: { x: 0, z: 0, lift: shaped.root.lift }, joints: shaped.joints };
}

const UPPER: JointName[] = ['abdomen', 'chest', 'neck', 'shoulder_r', 'elbow_r', 'wrist_r', 'shoulder_l', 'elbow_l', 'wrist_l', 'grip'];

/**
 * The pose a preset gives this fencer, keeping where they stand. `part` takes
 * only the upper body (spine, head, arms, grip) or only the legs and hips
 * from the preset, keeping the rest of the current pose.
 */
export function poseFromPreset(
  preset: PresetPose,
  handedness: Handedness,
  current: Pose,
  part: 'all' | 'upper' | 'lower' = 'all',
): Pose {
  const shaped = handedness === 'left' ? mirrorPose(preset.pose) : preset.pose;
  if (part === 'all') return { joints: shaped.joints, root: { ...current.root, lift: shaped.root.lift } };
  const joints = { ...current.joints };
  for (const name of JOINT_NAMES) {
    if (UPPER.includes(name) !== (part === 'upper')) continue;
    if (shaped.joints[name]) joints[name] = shaped.joints[name];
    else delete joints[name];
  }
  return { joints, root: current.root };
}

export function upsert(saved: PresetPose[], preset: PresetPose): PresetPose[] {
  const i = saved.findIndex((p) => p.id === preset.id);
  return i < 0 ? [...saved, preset] : saved.map((p, j) => (j === i ? preset : p));
}

export function newPresetId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pose';
  return `${slug}-${Date.now().toString(36)}`;
}
