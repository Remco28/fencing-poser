import { create } from 'zustand';
import type { Units } from '../model/units.ts';
import { download, libraryFile, mergeLibrary, parseLibraryFile, type LibraryFile } from '../library/backup.ts';
import {
  chooseFolder,
  folderStatus,
  folderSyncAvailable,
  forgetFolder,
  readFolder,
  reconnectFolder,
  writeFolder,
  writeFolderSnapshot,
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
  type StepCamera,
  type StepDisplay,
  type TargetArea,
} from '../model/combination.ts';
import { clampDof, JOINT_BY_NAME, JOINTS, oppositeJoint, type JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { angle, type FencerSetup, type Pose } from '../model/types.ts';
import type { PresetPose } from '../presets/builtin.ts';
import { advance, keyAt } from '../viewer/player.ts';
import { engage, pushBlades, touch } from '../ik/blades.ts';
import { newPresetId, poseFromPreset, presetPoseFrom, shownPresets, upsert, type ShownPreset } from '../presets/library.ts';

export type PresetPart = 'all' | 'upper' | 'lower';
export type { Units };

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
  /**
   * Shaping the movement into the current step: the poses are fixed and each
   * point's path can be bent by dragging its middle.
   */
  pathEdit: boolean;
  /** Start shaping the movement into step `index` (from the step before it). */
  editPath: (index: number) => void;
  exitPath: () => void;
  /** Bend (offset) or straighten (null) a fencer's path into the current step; a drag undoes as one. */
  setBend: (fencer: FencerId, bend: Pose['joints'] | null, dragId?: number) => void;
  /** Stomach and chest bend as one spine (the default) or separately. */
  spineTogether: boolean;
  toggleSpineTogether: () => void;
  /** The movement last nudged (from a key or a button), so the controls can light it up. */
  lastNudge: { dofIndex: number; id: number } | null;
  /** Modifier keys currently held, shown in the controls. */
  held: { shift: boolean; alt: boolean };
  setHeld: (held: { shift: boolean; alt: boolean }) => void;
  /** Space is held: dragging slides the view instead of turning it or grabbing a handle. */
  panning: boolean;
  setPanning: (on: boolean) => void;
  /** Locked: the camera cannot be orbited, panned or zoomed by hand. */
  cameraLocked: boolean;
  toggleCameraLock: () => void;
  /** Turn "one view for all steps" on (every step takes this step's view) or off. */
  toggleSharedView: () => void;
  /**
   * Playing the combination smoothly inside the editor, or paused at a point
   * between steps while scrubbing; null when editing.
   */
  preview: { pos: number; playing: boolean } | null;
  startPreview: () => void;
  stopPreview: () => void;
  tickPreview: (ms: number) => void;
  /** Show the moment at `pos` (in steps, 1.5 = halfway from step 2 to 3), paused. */
  scrubTo: (pos: number) => void;
  /** Play round and round instead of stopping at the end. */
  loop: boolean;
  toggleLoop: () => void;
  /** Whether the A / B tags show above the fencers. */
  showLabels: boolean;
  toggleLabels: () => void;
  /** Ask the camera to frame both fencers, or one. */
  fitRequest: { who: 'both' | FencerId; id: number } | null;
  requestFit: (who: 'both' | FencerId) => void;
  /** Whether drag handles show on the active fencer. */
  handles: boolean;
  toggleHandles: () => void;
  /** Move the active fencer along the piste, in metres toward their opponent. */
  advance: (metres: number) => void;
  setPosition: (x: number) => void;
  resetJoint: (joint: JointName) => void;
  /** Apply a preset to the other fencer, without switching to them. */
  applyPresetToOther: (preset: PresetPose) => void;
  /** The posing fencer lays their blade against the opponent's, in sixte or quarte. */
  engageBlades: (line: 'sixte' | 'quarte') => void;
  /** Bring the posing fencer's point onto a target; returns how far short it fell (0 if it landed). */
  touchTarget: (area: TargetArea) => number;
  /** Apply a preset to the whole body, or only the upper body or the legs. */
  applyPreset: (preset: PresetPose, part?: PresetPart) => void;
  presetPart: PresetPart;
  setPresetPart: (part: PresetPart) => void;
  /** Remember the view for the current step. Not an undoable edit. */
  setStepCamera: (camera: StepCamera) => void;
  /**
   * Where the camera should fly next. Moving between steps flies to the
   * step's saved view; choosing a view flies there and saves it to the step.
   */
  flight: { camera: StepCamera; id: number; save: boolean } | null;
  requestView: (camera: StepCamera) => void;
  setDisplay: (change: Partial<StepDisplay>) => void;
  toggleTarget: (fencer: FencerId, area: TargetArea) => void;
  /** Change a fencer's height, build, hand or grip (the active fencer unless named). */
  setSetup: (change: Partial<FencerSetup>, fencer?: FencerId) => void;
  setUnits: (units: Units) => void;
  undo: () => void;
  redo: () => void;

  goToStep: (index: number) => void;
  addStep: () => void;
  deleteStep: () => void;
  moveStep: (by: -1 | 1) => void;
  setStepText: (change: Partial<Pick<Step, 'label' | 'notes'>>) => void;
  setStepOptions: (change: Partial<Pick<Step, 'motionOnly' | 'durationMs'>>) => void;
  setTitle: (title: string) => void;

  start: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  openCombination: (id: string) => Promise<void>;
  createCombination: () => void;
  duplicateCombination: () => void;
  removeCombination: (id: string) => Promise<void>;
  /** Export everything (combinations and poses), or only the chosen combinations. */
  exportLibrary: (ids?: string[]) => Promise<void>;
  /** File a combination under a collection; '' leaves it unfiled. */
  setCollection: (id: string, collection: string) => Promise<void>;
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

function rememberedLabels(): boolean {
  try {
    return localStorage.getItem('fencing-poser.labels') !== 'off';
  } catch {
    return true;
  }
}
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

/** The combination with the current step changed by `change`. */
function withStep(s: Snapshot, change: (step: Step) => Step): Combination {
  return withSteps(
    s.combination,
    s.combination.steps.map((step, i) => (i === s.stepIndex ? change(step) : step)),
  );
}

/** The active fencer's new pose, with the other blade pushed aside if the blades meet. */
function moved(s: EditorState, pose: Pose): Combination {
  const step = currentStep(s);
  const after = pushBlades(s.combination, step.poses, { ...step.poses, [s.active]: pose }, s.active);
  return withStep(s, (st) => ({ ...st, poses: after }));
}

/** Is this joint being moved as part of the whole spine? */
function spineJoint(s: EditorState, joint: JointName): boolean {
  return s.spineTogether && (joint === 'abdomen' || joint === 'chest');
}

/** The whole spine's angle for a movement: stomach and chest together. */
export function spineAngle(pose: Pose, dof: string): number {
  return angle(pose, 'abdomen', dof) + angle(pose, 'chest', dof);
}

/** Bend the whole spine by `delta`, shared between stomach and chest, each within its limits. */
function bendSpine(pose: Pose, dof: string, delta: number): Pose {
  const lower = withAngle(pose, 'abdomen', dof, angle(pose, 'abdomen', dof) + delta * 0.55);
  // Whatever the stomach could not take (at its limit), the chest takes.
  const taken = angle(lower, 'abdomen', dof) - angle(pose, 'abdomen', dof);
  return withAngle(lower, 'chest', dof, angle(lower, 'chest', dof) + (delta - taken));
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
      set((s) => {
        const pose = activePose(s);
        const next = spineJoint(s, joint)
          ? bendSpine(pose, dof, value - spineAngle(pose, dof))
          : withAngle(pose, joint, dof, value);
        return edit(s, { combination: moved(s, next) }, `${s.active}.${joint}.${dof}`);
      }),
    pathEdit: false,
    editPath: (index) => set({ stepIndex: index, pathEdit: true, selected: null, preview: null }),
    exitPath: () => set({ pathEdit: false }),
    setBend: (fencer, bend, dragId) =>
      set((s) =>
        edit(
          s,
          {
            combination: withStep(s, (st) => {
              const bends = { ...st.bend };
              if (bend) bends[fencer] = bend;
              else delete bends[fencer];
              // The older halfway-pose shaping gives way to the bend.
              const via = { ...st.via };
              delete via[fencer];
              return {
                ...st,
                bend: Object.keys(bends).length ? bends : undefined,
                via: Object.keys(via).length ? via : undefined,
              };
            }),
          },
          dragId === undefined ? undefined : `drag.path.${dragId}`,
        ),
      ),
    spineTogether: true,
    toggleSpineTogether: () => set((s) => ({ spineTogether: !s.spineTogether })),
    nudge: (dofIndex, delta) =>
      set((s) => {
        const dof = s.selected && JOINT_BY_NAME[s.selected].dofs[dofIndex];
        if (!s.selected || !dof) return {};
        const current = activePose(s);
        const pose = spineJoint(s, s.selected)
          ? bendSpine(current, dof.key, delta)
          : withAngle(current, s.selected, dof.key, angle(current, s.selected, dof.key) + delta);
        return {
          ...edit(s, { combination: moved(s, pose) }, `${s.active}.${s.selected}.${dof.key}`),
          lastNudge: { dofIndex, id: (s.lastNudge?.id ?? 0) + 1 },
        };
      }),
    lastNudge: null,
    held: { shift: false, alt: false },
    setHeld: (held) => set((s) => (s.held.shift === held.shift && s.held.alt === held.alt ? {} : { held })),
    panning: false,
    setPanning: (on) => set((s) => (s.panning === on ? {} : { panning: on })),
    cameraLocked: false,
    toggleCameraLock: () => set((s) => ({ cameraLocked: !s.cameraLocked })),
    toggleSharedView: () =>
      set((s) => {
        if (s.combination.sharedView) return edit(s, { combination: { ...s.combination, sharedView: false } });
        const camera = currentStep(s).camera;
        const steps = camera ? s.combination.steps.map((step) => ({ ...step, camera })) : s.combination.steps;
        return edit(s, { combination: { ...withSteps(s.combination, steps), sharedView: true } });
      }),
    preview: null,
    startPreview: () =>
      set((s) => {
        const last = s.combination.steps.length - 1;
        const from = s.preview ? s.preview.pos : s.stepIndex;
        return { preview: { pos: from >= last - 1e-6 ? 0 : from, playing: true }, selected: null };
      }),
    scrubTo: (pos) => set({ preview: { pos, playing: false }, selected: null }),
    loop: false,
    toggleLoop: () => set((s) => ({ loop: !s.loop })),
    stopPreview: () =>
      set((s) => (s.preview ? { preview: null, stepIndex: keyAt(s.combination, s.preview.pos) } : {})),
    tickPreview: (ms) =>
      set((s) => {
        if (!s.preview?.playing) return {};
        const end = s.combination.steps.length - 1;
        const pos = advance(s.combination, s.preview.pos, ms, end);
        if (pos < end) return { preview: { pos, playing: true } };
        // At the end: round again, or stop on the last step.
        return s.loop ? { preview: { pos: 0, playing: true } } : { preview: null, stepIndex: end };
      }),
    showLabels: rememberedLabels(),
    toggleLabels: () =>
      set((s) => {
        try {
          localStorage.setItem('fencing-poser.labels', s.showLabels ? 'off' : 'on');
        } catch {
          // Only a preference.
        }
        return { showLabels: !s.showLabels };
      }),
    fitRequest: null,
    requestFit: (who) => set((s) => ({ fitRequest: { who, id: (s.fitRequest?.id ?? 0) + 1 } })),
    dragPose: (pose, dragId) => set((s) => edit(s, { combination: moved(s, pose) }, `drag.${dragId}`)),
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
        return edit(s, { combination: moved(s, { ...pose, root }) }, `${s.active}.position`);
      }),
    resetJoint: (joint) =>
      set((s) => {
        const joints = { ...activePose(s).joints };
        delete joints[joint];
        return edit(s, { combination: withPose(s, { ...activePose(s), joints }) });
      }),
    applyPreset: (preset, part = get().presetPart) =>
      set((s) =>
        edit(s, { combination: moved(s, poseFromPreset(preset, activeSetup(s).handedness, activePose(s), part)) }),
      ),
    applyPresetToOther: (preset) =>
      set((s) => {
        const f: FencerId = s.active === 'A' ? 'B' : 'A';
        const step = currentStep(s);
        const pose = poseFromPreset(preset, s.combination.fencers[f].handedness, step.poses[f], s.presetPart);
        const after = pushBlades(s.combination, step.poses, { ...step.poses, [f]: pose }, f);
        return edit(s, { combination: withStep(s, (st) => ({ ...st, poses: after })) });
      }),
    engageBlades: (line) =>
      set((s) => edit(s, { combination: withStep(s, (st) => ({ ...st, poses: engage(s.combination, st.poses, s.active, line) })) })),
    touchTarget: (area) => {
      const s = get();
      const before = currentStep(s).poses;
      const result = touch(s.combination, before, s.active, area);
      const poses = pushBlades(s.combination, before, result.poses, s.active);
      set(edit(s, { combination: withStep(s, (st) => ({ ...st, poses })) }));
      return result.short;
    },
    presetPart: 'all',
    setPresetPart: (presetPart) => set({ presetPart }),
    setStepCamera: (camera) =>
      set((s) => {
        const combination = s.combination.sharedView
          ? withSteps(s.combination, s.combination.steps.map((step) => ({ ...step, camera })))
          : withStep(s, (step) => ({ ...step, camera }));
        return { combination: { ...combination, updatedAt: new Date().toISOString() } };
      }),
    flight: null,
    requestView: (camera) => set((s) => ({ flight: { camera, id: (s.flight?.id ?? 0) + 1, save: true } })),
    setDisplay: (change) =>
      set((s) => edit(s, { combination: withStep(s, (step) => ({ ...step, display: { ...step.display, ...change } })) })),
    toggleTarget: (fencer, area) =>
      set((s) =>
        edit(s, {
          combination: withStep(s, (step) => {
            const targets = step.display?.targets ?? [];
            const on = targets.some((t) => t.fencer === fencer && t.area === area);
            const next = on ? targets.filter((t) => !(t.fencer === fencer && t.area === area)) : [...targets, { fencer, area }];
            return { ...step, display: { ...step.display, targets: next } };
          }),
        }),
      ),
    setSetup: (change, fencer) =>
      set((s) => {
        const f = fencer ?? s.active;
        const before = s.combination.fencers[f];
        const setup = { ...before, ...change };
        let combination: Combination = { ...s.combination, fencers: { ...s.combination.fencers, [f]: setup } };
        if (setup.handedness === before.handedness) {
          return edit(s, { combination }, `${f}.setup.${Object.keys(change).join(',')}`);
        }
        // Switching hands mirrors this fencer in every step, so the weapon arm keeps its pose.
        combination = withSteps(
          combination,
          combination.steps.map((step) => ({ ...step, poses: { ...step.poses, [f]: mirrorPose(step.poses[f]) } })),
        );
        return { ...edit(s, { combination }), selected: f === s.active && s.selected ? oppositeJoint(s.selected) : s.selected };
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
      set((s) => ({ stepIndex: Math.max(0, Math.min(s.combination.steps.length - 1, index)), lastEdit: null, pathEdit: false })),
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
        edit(s, { combination: withStep(s, (step) => ({ ...step, ...change })) }, `text.${s.stepIndex}.${Object.keys(change).join(',')}`),
      ),
    setStepOptions: (change) => set((s) => edit(s, { combination: withStep(s, (step) => ({ ...step, ...change })) })),
    setTitle: (title) => set((s) => edit(s, { combination: { ...s.combination, title } }, 'title')),

    start: async () => {
      // Ask the browser not to clear this site's storage when the disk gets full.
      void navigator.storage?.persist?.().catch(() => false);
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
    exportLibrary: async (ids) => {
      await saveCombination(get().combination);
      const all = await listCombinations();
      const chosen = ids ? all.filter((c) => ids.includes(c.id)) : all;
      // A chosen few travel without the poses; a whole-library backup carries everything.
      const file = libraryFile(ids ? [] : get().savedPresets, chosen);
      const name = ids
        ? `fencing-poser-${chosen.length === 1 ? chosen[0].title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `${chosen.length}-combinations`}`
        : 'fencing-poser-library';
      download(`${name}-${file.exportedAt.slice(0, 10)}.json`, JSON.stringify(file, null, 1));
    },
    setCollection: async (id, collection) => {
      const name = collection.trim();
      if (get().combination.id === id) {
        set((s) => edit(s, { combination: { ...s.combination, collection: name || undefined } }));
        return;
      }
      const c = await loadCombination(id);
      if (!c) return;
      await saveCombination({ ...c, collection: name || undefined, updatedAt: new Date().toISOString() });
      // Saving another combination marks it last-open; keep the open one as last-open.
      await saveCombination(get().combination);
      await get().refreshLibrary();
      scheduleFolderWrite();
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
  const text = JSON.stringify(libraryFile(useEditor.getState().savedPresets, await listCombinations()), null, 1);
  const ok = await writeFolder(text);
  if (ok) await writeFolderSnapshot(text);
  const folder = useEditor.getState().folder;
  if (!ok && folder?.ready) useEditor.setState({ folder: { ...folder, ready: false } });
}

// Any change of step (navigating, undo, opening a combination) flies the
// camera to that step's saved view, if it has one.
useEditor.subscribe((s, prev) => {
  const step = currentStep(s);
  if (step.id === currentStep(prev).id || !step.camera) return;
  useEditor.setState({ flight: { camera: step.camera, id: (s.flight?.id ?? 0) + 1, save: false } });
});
