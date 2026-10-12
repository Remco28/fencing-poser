import { create } from 'zustand';
import { clampDof, oppositeJoint, type JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { DEFAULT_SETUP, emptyPose, type FencerSetup, type Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS, type PresetPose } from '../presets/builtin.ts';

export type Units = 'metric' | 'imperial';

interface EditorState {
  setup: FencerSetup;
  pose: Pose;
  selected: JointName | null;
  units: Units;
  select: (joint: JointName | null) => void;
  setAngle: (joint: JointName, dof: string, value: number) => void;
  resetJoint: (joint: JointName) => void;
  applyPreset: (preset: PresetPose) => void;
  setSetup: (change: Partial<FencerSetup>) => void;
  setUnits: (units: Units) => void;
}

const enGarde = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')?.pose ?? emptyPose();

export const useEditor = create<EditorState>((set) => ({
  setup: DEFAULT_SETUP,
  pose: enGarde,
  selected: null,
  units: 'metric',
  select: (selected) => set({ selected }),
  setAngle: (joint, dof, value) =>
    set(({ pose }) => ({
      pose: {
        ...pose,
        joints: { ...pose.joints, [joint]: { ...pose.joints[joint], [dof]: clampDof(joint, dof, value) } },
      },
    })),
  resetJoint: (joint) =>
    set(({ pose }) => {
      const joints = { ...pose.joints };
      delete joints[joint];
      return { pose: { ...pose, joints } };
    }),
  applyPreset: (preset) =>
    set(({ setup, pose }) => {
      const shaped = setup.handedness === 'left' ? mirrorPose(preset.pose) : preset.pose;
      // A preset changes the body, not where the fencer stands.
      return { pose: { ...shaped, root: pose.root } };
    }),
  setSetup: (change) =>
    set(({ setup, pose, selected }) => {
      const next = { ...setup, ...change };
      if (next.handedness === setup.handedness) return { setup: next };
      // Switching hands mirrors the body, so the weapon arm keeps its pose.
      return {
        setup: next,
        pose: mirrorPose(pose),
        selected: selected && oppositeJoint(selected),
      };
    }),
  setUnits: (units) => set({ units }),
}));
