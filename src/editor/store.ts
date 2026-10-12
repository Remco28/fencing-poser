import { create } from 'zustand';
import { download, libraryFile, mergeLibrary, parseLibraryFile, type LibraryFile } from '../library/backup.ts';
import {
  chooseFolder,
  folderStatus,
  folderSyncAvailable,
  forgetFolder,
  readFolder,
  reconnectFolder,
  writeFolder,
  type FolderStatus,
} from '../library/folder.ts';
import {
  deleteCombination,
  lastOpenId,
  listCombinations,
  loadCombination,
  loadPresets,
  saveCombination,
  savePresets,
  toEntry,
  type LibraryEntry,
} from '../library/storage.ts';
import {
  copyStep,
  FORWARD,
  newCombination,
  newId,
  type Combination,
  type FencerId,
  type Step,
} from '../model/combination.ts';
import { clampDof, JOINT_BY_NAME, JOINTS, oppositeJoint, type JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { angle, type FencerSetup, type Pose } from '../model/types.ts';
import type { PresetPose } from '../presets/builtin.ts';
import { newPresetId, poseFromPreset, presetPoseFrom, shownPresets, upsert, type ShownPreset } from '../presets/library.ts';

export type Units = 'metric' | 'imperial';

interface Snapshot {
  combination: Combination;
  stepIndex: number;
}

interface EditorState extends Snapshot {
  /** The fencer being posed. */
  active: FencerId;
  selected: JointName | null;
  units: Units;
  past: Snapshot[];
  future: Snapshot[];
  /** Edits with the same key in quick succession (a slider drag, a held key) undo as one. */
  lastEdit: { key: string; at: number } | null;
  /** What the coach saved: custom presets and edited built-ins. */
  savedPresets: PresetPose[];
  presets: ShownPreset[];
  library: LibraryEntry[];
  /** False until the last-open combination has been read from storage. */
  loaded: boolean;
  /** The folder the library is mirrored to, if any. */
  folder: FolderStatus;

  select: (joint: JointName | null, fencer?: FencerId) => void;
  setActive: (fencer: FencerId) => void;
  selectNext: (step: 1 | -1) => void;
  selectOpposite: () => void;
  setAngle: (joint: JointName, dof: string, value: number) => void;
  /** Nudge the selected joint's n-th movement by `delta` degrees. */
  nudge: (dofIndex: number, delta: number) => void;
  /** Replace the active fencer's pose during one drag; a whole drag undoes as one step. */
  dragPose: (pose: Pose, dragId: number) => void;
  /** Whether drag handles show on the active fencer. */
  handles: boolean;
  toggleHandles: () => void;
  /** Move the active fencer along the piste, in metres toward their opponent. */
  advance: (metres: number) => void;
  setPosition: (x: number) => void;
  resetJoint: (joint: JointName) => void;
  applyPreset: (preset: PresetPose) => void;
  setSetup: (change: Partial<FencerSetup>) => void;
  setUnits: (units: Units) => void;
  undo: () => void;
  redo: () => void;

  goToStep: (index: number) => void;
  addStep: () => void;
  deleteStep: () => void;
  moveStep: (by: -1 | 1) => void;
  setStepText: (change: Partial<Pick<Step, 'label' | 'notes'>>) => void;
  setTitle: (title: string) => void;

  start: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  openCombination: (id: string) => Promise<void>;
  createCombination: () => void;
  duplicateCombination: () => void;
  removeCombination: (id: string) => Promise<void>;
  exportLibrary: () => Promise<void>;
  importLibrary: (text: string) => Promise<string>;
  connectFolder: () => Promise<string>;
  reconnectFolder: () => Promise<string>;
  disconnectFolder: () => Promise<void>;

  saveCurrentAsPreset: (name: string) => void;
  updatePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  /** Deletes a custom preset, or restores a built-in one to the original. */
  removePreset: (id: string) => void;
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1000;

export function currentStep(s: Snapshot): Step {
  return s.combination.steps[s.stepIndex];
}

export function activePose(s: EditorState): Pose {
  return currentStep(s).poses[s.active];
}

export function activeSetup(s: EditorState): FencerSetup {
  return s.combination.fencers[s.active];
}

/** Record the current state in history before applying `next`. */
function edit(state: EditorState, next: Partial<Snapshot>, key?: string): Partial<EditorState> {
  const now = Date.now();
  // A drag stays one step however slowly it moves; other edits merge only in quick succession.
  const joined = key && state.lastEdit?.key === key && (key.startsWith('drag.') || now - state.lastEdit.at < COALESCE_MS);
  const combination = next.combination && { ...next.combination, updatedAt: new Date(now).toISOString() };
  return {
    ...next,
    ...(combination && { combination }),
    past: joined
      ? state.past
      : [...state.past, { combination: state.combination, stepIndex: state.stepIndex }].slice(-HISTORY_LIMIT),
    future: [],
    lastEdit: key ? { key, at: now } : null,
  };
}

function withSteps(c: Combination, steps: Step[]): Combination {
  return { ...c, steps };
}

/** The combination with the active fencer's pose in the current step replaced. */
function withPose(s: EditorState, pose: Pose): Combination {
  return withSteps(
    s.combination,
    s.combination.steps.map((step, i) => (i === s.stepIndex ? { ...step, poses: { ...step.poses, [s.active]: pose } } : step)),
  );
}

function withAngle(pose: Pose, joint: JointName, dof: string, value: number): Pose {
  return {
    ...pose,
    joints: { ...pose.joints, [joint]: { ...pose.joints[joint], [dof]: clampDof(joint, dof, value) } },
  };
}

const PISTE_HALF = 8.5;

function fresh(combination: Combination): Partial<EditorState> {
  return { combination, stepIndex: 0, past: [], future: [], lastEdit: null, selected: null, active: 'A' };
}

export const useEditor = create<EditorState>((set, get) => {
  /** Update saved presets in memory and in the browser's storage. */
  const storePresets = (savedPresets: PresetPose[]) => {
    set({ savedPresets, presets: shownPresets(savedPresets) });
    void savePresets(savedPresets).then(scheduleFolderWrite);
  };

  /** Merge a library file into this browser. Returns what happened, in words. */
  const mergeIn = async (file: LibraryFile): Promise<string> => {
    await saveCombination(get().combination);
    const merged = mergeLibrary(file, get().savedPresets, await listCombinations());
    for (const c of merged.combinations) await saveCombination(c);
    if (merged.presetsChanged) {
      set({ savedPresets: merged.presets, presets: shownPresets(merged.presets) });
      await savePresets(merged.presets);
    }
    const open = merged.combinations.find((c) => c.id === get().combination.id);
    if (open) set(fresh(open));
    await get().refreshLibrary();
    const parts = [`${merged.added} added`, `${merged.updated} updated`];
    if (merged.keptNewer) parts.push(`${merged.keptNewer} kept because yours were newer`);
    return parts.join(', ');
  };

  /** Read the folder's library into this browser, then write the result back. */
  const syncFolder = async (): Promise<string> => {
    const text = await readFolder();
    const file = text ? parseLibraryFile(text) : null;
    const message = file ? await mergeIn(file) : '';
    await writeLibraryToFolder();
    return message;
  };

  const first = newCombination();

  return {
    combination: first,
    stepIndex: 0,
    active: 'A',
    selected: null,
    units: 'metric',
    past: [],
    future: [],
    lastEdit: null,
    savedPresets: [],
    presets: shownPresets([]),
    library: [],
    loaded: false,
    folder: null,

    select: (selected, fencer) => set((s) => ({ selected, active: fencer ?? s.active })),
    setActive: (active) => set({ active }),
    selectNext: (step) =>
      set(({ selected }) => {
        const i = selected ? JOINTS.findIndex((j) => j.name === selected) : step > 0 ? -1 : 0;
        return { selected: JOINTS[(i + step + JOINTS.length) % JOINTS.length].name };
      }),
    selectOpposite: () => set(({ selected }) => ({ selected: selected && oppositeJoint(selected) })),

    setAngle: (joint, dof, value) =>
      set((s) => edit(s, { combination: withPose(s, withAngle(activePose(s), joint, dof, value)) }, `${s.active}.${joint}.${dof}`)),
    nudge: (dofIndex, delta) =>
      set((s) => {
        const dof = s.selected && JOINT_BY_NAME[s.selected].dofs[dofIndex];
        if (!s.selected || !dof) return {};
        const pose = withAngle(activePose(s), s.selected, dof.key, angle(activePose(s), s.selected, dof.key) + delta);
        return edit(s, { combination: withPose(s, pose) }, `${s.active}.${s.selected}.${dof.key}`);
      }),
    dragPose: (pose, dragId) => set((s) => edit(s, { combination: withPose(s, pose) }, `drag.${dragId}`)),
    handles: true,
    toggleHandles: () => set((s) => ({ handles: !s.handles })),
    advance: (metres) => {
      const s = get();
      s.setPosition(activePose(s).root.x + metres * FORWARD[s.active]);
    },
    setPosition: (x) =>
      set((s) => {
        const pose = activePose(s);
        const root = { ...pose.root, x: Math.max(-PISTE_HALF, Math.min(PISTE_HALF, x)) };
        return edit(s, { combination: withPose(s, { ...pose, root }) }, `${s.active}.position`);
      }),
    resetJoint: (joint) =>
      set((s) => {
        const joints = { ...activePose(s).joints };
        delete joints[joint];
        return edit(s, { combination: withPose(s, { ...activePose(s), joints }) });
      }),
    applyPreset: (preset) =>
      set((s) =>
        edit(s, { combination: withPose(s, poseFromPreset(preset, activeSetup(s).handedness, activePose(s))) }),
      ),
    setSetup: (change) =>
      set((s) => {
        const setup = { ...activeSetup(s), ...change };
        let combination: Combination = { ...s.combination, fencers: { ...s.combination.fencers, [s.active]: setup } };
        if (setup.handedness === activeSetup(s).handedness) {
          return edit(s, { combination }, `${s.active}.setup.${Object.keys(change).join(',')}`);
        }
        // Switching hands mirrors this fencer in every step, so the weapon arm keeps its pose.
        combination = withSteps(
          combination,
          combination.steps.map((step) => ({ ...step, poses: { ...step.poses, [s.active]: mirrorPose(step.poses[s.active]) } })),
        );
        return { ...edit(s, { combination }), selected: s.selected && oppositeJoint(s.selected) };
      }),
    setUnits: (units) => set({ units }),

    undo: () =>
      set((s) => {
        const previous = s.past.at(-1);
        if (!previous) return {};
        return {
          ...previous,
          past: s.past.slice(0, -1),
          future: [{ combination: s.combination, stepIndex: s.stepIndex }, ...s.future],
          lastEdit: null,
        };
      }),
    redo: () =>
      set((s) => {
        const [next, ...rest] = s.future;
        if (!next) return {};
        return {
          ...next,
          past: [...s.past, { combination: s.combination, stepIndex: s.stepIndex }],
          future: rest,
          lastEdit: null,
        };
      }),

    goToStep: (index) =>
      set((s) => ({ stepIndex: Math.max(0, Math.min(s.combination.steps.length - 1, index)), lastEdit: null })),
    addStep: () =>
      set((s) => {
        const steps = [...s.combination.steps];
        steps.splice(s.stepIndex + 1, 0, copyStep(currentStep(s)));
        return { ...edit(s, { combination: withSteps(s.combination, steps) }), stepIndex: s.stepIndex + 1 };
      }),
    deleteStep: () =>
      set((s) => {
        if (s.combination.steps.length < 2) return {};
        const steps = s.combination.steps.filter((_, i) => i !== s.stepIndex);
        return { ...edit(s, { combination: withSteps(s.combination, steps) }), stepIndex: Math.min(s.stepIndex, steps.length - 1) };
      }),
    moveStep: (by) =>
      set((s) => {
        const to = s.stepIndex + by;
        if (to < 0 || to >= s.combination.steps.length) return {};
        const steps = [...s.combination.steps];
        [steps[s.stepIndex], steps[to]] = [steps[to], steps[s.stepIndex]];
        return { ...edit(s, { combination: withSteps(s.combination, steps) }), stepIndex: to };
      }),
    setStepText: (change) =>
      set((s) =>
        edit(
          s,
          {
            combination: withSteps(
              s.combination,
              s.combination.steps.map((step, i) => (i === s.stepIndex ? { ...step, ...change } : step)),
            ),
          },
          `text.${s.stepIndex}.${Object.keys(change).join(',')}`,
        ),
      ),
    setTitle: (title) => set((s) => edit(s, { combination: { ...s.combination, title } }, 'title')),

    start: async () => {
      const [savedPresets, lastId, folder] = await Promise.all([loadPresets(), lastOpenId(), folderStatus()]);
      const last = lastId ? await loadCombination(lastId) : null;
      set({ savedPresets, presets: shownPresets(savedPresets), ...(last && fresh(last)), loaded: true, folder });
      await get().refreshLibrary();
      if (folder?.ready) await syncFolder();
    },
    refreshLibrary: async () => {
      const all = await listCombinations();
      set({ library: all.map(toEntry) });
    },
    openCombination: async (id) => {
      const c = await loadCombination(id);
      if (c) set(fresh(c));
    },
    createCombination: () => set(fresh(newCombination())),
    duplicateCombination: () => {
      const now = new Date().toISOString();
      const copy = {
        ...structuredClone(get().combination),
        id: newId('combo'),
        title: `${get().combination.title} (copy)`,
        createdAt: now,
        updatedAt: now,
      };
      set(fresh(copy));
      void saveCombination(copy).then(() => get().refreshLibrary());
    },
    removeCombination: async (id) => {
      await deleteCombination(id);
      if (get().combination.id === id) set(fresh(newCombination()));
      await get().refreshLibrary();
    },
    exportLibrary: async () => {
      await saveCombination(get().combination);
      const file = libraryFile(get().savedPresets, await listCombinations());
      download(`fencing-poser-library-${file.exportedAt.slice(0, 10)}.json`, JSON.stringify(file, null, 1));
    },
    importLibrary: async (text) => {
      const file = parseLibraryFile(text);
      if (!file) return 'That file is not a Fencing Poser library.';
      const message = `Imported: ${await mergeIn(file)}.`;
      scheduleFolderWrite();
      return message;
    },
    connectFolder: async () => {
      if (!folderSyncAvailable()) return 'This browser cannot save to a folder. Use Export backup instead.';
      const folder = await chooseFolder();
      if (!folder) return '';
      set({ folder });
      const merged = await syncFolder();
      return `Saving to the folder “${folder.name}”.${merged ? ` From the folder: ${merged}.` : ''}`;
    },
    reconnectFolder: async () => {
      const folder = await reconnectFolder();
      set({ folder });
      if (!folder?.ready) return 'The browser did not allow access to the folder.';
      const merged = await syncFolder();
      return `Reconnected to “${folder.name}”.${merged ? ` From the folder: ${merged}.` : ''}`;
    },
    disconnectFolder: async () => {
      await forgetFolder();
      set({ folder: null });
    },

    saveCurrentAsPreset: (name) => {
      const s = get();
      const preset = {
        id: newPresetId(name),
        name,
        builtIn: false,
        pose: presetPoseFrom(activePose(s), activeSetup(s).handedness),
        updatedAt: new Date().toISOString(),
      };
      storePresets([...s.savedPresets, preset]);
    },
    updatePreset: (id) => {
      const s = get();
      const shown = s.presets.find((p) => p.id === id);
      if (!shown) return;
      const { modified: _, ...preset } = shown;
      const pose = presetPoseFrom(activePose(s), activeSetup(s).handedness);
      storePresets(upsert(s.savedPresets, { ...preset, pose, updatedAt: new Date().toISOString() }));
    },
    renamePreset: (id, name) => {
      const { savedPresets, presets } = get();
      const shown = presets.find((p) => p.id === id);
      if (!shown || !name.trim()) return;
      const { modified: _, ...preset } = shown;
      storePresets(upsert(savedPresets, { ...preset, name: name.trim(), updatedAt: new Date().toISOString() }));
    },
    removePreset: (id) => storePresets(get().savedPresets.filter((p) => p.id !== id)),
  };
});

// Autosave: write the open combination shortly after an edit. Opening one is
// not an edit, and a new combination is not saved until something changes.
let timer: ReturnType<typeof setTimeout> | undefined;
useEditor.subscribe((s, prev) => {
  const edited = s.combination.id === prev.combination.id && s.combination.updatedAt !== prev.combination.updatedAt;
  if (!s.loaded || !edited) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void saveCombination(useEditor.getState().combination).then(() => {
      void useEditor.getState().refreshLibrary();
      scheduleFolderWrite();
    });
  }, 400);
});

// Folder mirror: rewrite the whole library file shortly after anything is saved.
let folderTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFolderWrite() {
  if (!useEditor.getState().folder?.ready) return;
  clearTimeout(folderTimer);
  folderTimer = setTimeout(() => void writeLibraryToFolder(), 800);
}

async function writeLibraryToFolder() {
  const ok = await writeFolder(JSON.stringify(libraryFile(useEditor.getState().savedPresets, await listCombinations()), null, 1));
  const folder = useEditor.getState().folder;
  if (!ok && folder?.ready) useEditor.setState({ folder: { ...folder, ready: false } });
}
