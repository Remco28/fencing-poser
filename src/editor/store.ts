import { create } from 'zustand';
import { loadPresets, savePresets } from '../library/storage.ts';
import { clampDof, JOINT_BY_NAME, JOINTS, oppositeJoint, type JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { angle, DEFAULT_SETUP, emptyPose, type FencerSetup, type Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS, type PresetPose } from '../presets/builtin.ts';
import { newPresetId, poseFromPreset, presetPoseFrom, shownPresets, upsert, type ShownPreset } from '../presets/library.ts';

export type Units = 'metric' | 'imperial';

interface Snapshot {
  setup: FencerSetup;
  pose: Pose;
}

interface EditorState extends Snapshot {
  selected: JointName | null;
  units: Units;
  past: Snapshot[];
  future: Snapshot[];
  /** Edits with the same key in quick succession (a slider drag, a held key) undo as one. */
  lastEdit: { key: string; at: number } | null;
  /** What the coach saved: custom presets and edited built-ins. */
  savedPresets: PresetPose[];
  presets: ShownPreset[];

  select: (joint: JointName | null) => void;
  selectNext: (step: 1 | -1) => void;
  selectOpposite: () => void;
  setAngle: (joint: JointName, dof: string, value: number) => void;
  /** Nudge the selected joint's n-th movement by `delta` degrees. */
  nudge: (dofIndex: number, delta: number) => void;
  resetJoint: (joint: JointName) => void;
  applyPreset: (preset: PresetPose) => void;
  setSetup: (change: Partial<FencerSetup>) => void;
  setUnits: (units: Units) => void;
  undo: () => void;
  redo: () => void;

  loadSavedPresets: () => Promise<void>;
  saveCurrentAsPreset: (name: string) => void;
  updatePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  /** Deletes a custom preset, or restores a built-in one to the original. */
  removePreset: (id: string) => void;
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1000;

const enGarde = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')?.pose ?? emptyPose();

/** Record the current state in history before applying `next`. */
function edit(state: EditorState, next: Partial<Snapshot>, key?: string): Partial<EditorState> {
  const now = Date.now();
  const joined = key && state.lastEdit?.key === key && now - state.lastEdit.at < COALESCE_MS;
  return {
    ...next,
    past: joined ? state.past : [...state.past, { setup: state.setup, pose: state.pose }].slice(-HISTORY_LIMIT),
    future: [],
    lastEdit: key ? { key, at: now } : null,
  };
}

function withAngle(pose: Pose, joint: JointName, dof: string, value: number): Pose {
  return {
    ...pose,
    joints: { ...pose.joints, [joint]: { ...pose.joints[joint], [dof]: clampDof(joint, dof, value) } },
  };
}

export const useEditor = create<EditorState>((set, get) => {
  /** Update saved presets in memory and in the browser's storage. */
  const storePresets = (savedPresets: PresetPose[]) => {
    set({ savedPresets, presets: shownPresets(savedPresets) });
    void savePresets(savedPresets);
  };

  return {
    setup: DEFAULT_SETUP,
    pose: enGarde,
    selected: null,
    units: 'metric',
    past: [],
    future: [],
    lastEdit: null,
    savedPresets: [],
    presets: shownPresets([]),

    select: (selected) => set({ selected }),
    selectNext: (step) =>
      set(({ selected }) => {
        const i = selected ? JOINTS.findIndex((j) => j.name === selected) : step > 0 ? -1 : 0;
        return { selected: JOINTS[(i + step + JOINTS.length) % JOINTS.length].name };
      }),
    selectOpposite: () => set(({ selected }) => ({ selected: selected && oppositeJoint(selected) })),

    setAngle: (joint, dof, value) =>
      set((s) => edit(s, { pose: withAngle(s.pose, joint, dof, value) }, `${joint}.${dof}`)),
    nudge: (dofIndex, delta) =>
      set((s) => {
        const dof = s.selected && JOINT_BY_NAME[s.selected].dofs[dofIndex];
        if (!s.selected || !dof) return {};
        const value = angle(s.pose, s.selected, dof.key) + delta;
        return edit(s, { pose: withAngle(s.pose, s.selected, dof.key, value) }, `${s.selected}.${dof.key}`);
      }),
    resetJoint: (joint) =>
      set((s) => {
        const joints = { ...s.pose.joints };
        delete joints[joint];
        return edit(s, { pose: { ...s.pose, joints } });
      }),
    applyPreset: (preset) =>
      set((s) => edit(s, { pose: poseFromPreset(preset, s.setup.handedness, s.pose) })),
    setSetup: (change) =>
      set((s) => {
        const setup = { ...s.setup, ...change };
        const key = Object.keys(change).join(',');
        if (setup.handedness === s.setup.handedness) return edit(s, { setup }, `setup.${key}`);
        // Switching hands mirrors the body, so the weapon arm keeps its pose.
        return { ...edit(s, { setup, pose: mirrorPose(s.pose) }), selected: s.selected && oppositeJoint(s.selected) };
      }),
    setUnits: (units) => set({ units }),

    undo: () =>
      set((s) => {
        const previous = s.past.at(-1);
        if (!previous) return {};
        return {
          ...previous,
          past: s.past.slice(0, -1),
          future: [{ setup: s.setup, pose: s.pose }, ...s.future],
          lastEdit: null,
        };
      }),
    redo: () =>
      set((s) => {
        const [next, ...rest] = s.future;
        if (!next) return {};
        return { ...next, past: [...s.past, { setup: s.setup, pose: s.pose }], future: rest, lastEdit: null };
      }),

    loadSavedPresets: async () => {
      const savedPresets = await loadPresets();
      set({ savedPresets, presets: shownPresets(savedPresets) });
    },
    saveCurrentAsPreset: (name) => {
      const { pose, setup, savedPresets } = get();
      const preset = { id: newPresetId(name), name, builtIn: false, pose: presetPoseFrom(pose, setup.handedness) };
      storePresets([...savedPresets, preset]);
    },
    updatePreset: (id) => {
      const { pose, setup, savedPresets, presets } = get();
      const shown = presets.find((p) => p.id === id);
      if (!shown) return;
      const { modified: _, ...preset } = shown;
      storePresets(upsert(savedPresets, { ...preset, pose: presetPoseFrom(pose, setup.handedness) }));
    },
    renamePreset: (id, name) => {
      const { savedPresets, presets } = get();
      const shown = presets.find((p) => p.id === id);
      if (!shown || !name.trim()) return;
      const { modified: _, ...preset } = shown;
      storePresets(upsert(savedPresets, { ...preset, name: name.trim() }));
    },
    removePreset: (id) => storePresets(get().savedPresets.filter((p) => p.id !== id)),
  };
});
