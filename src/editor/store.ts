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
import { describeEdit } from './history.ts';
import {
  copyStep,
  FORWARD,
  HEADING,
  newCombination,
  newId,
  type Combination,
  type FencerId,
  type Pin,
  type Step,
  type StepCamera,
  type StepDisplay,
  type TargetArea,
} from '../model/combination.ts';
import { clampDof, JOINT_BY_NAME, JOINTS, oppositeJoint, type JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { angle, type FencerSetup, type Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS, type PresetPose } from '../presets/builtin.ts';
import { advance, keyAt } from '../viewer/player.ts';
import { pushBlades } from '../ik/blades.ts';
import { applyAction, shapePath, touchBlades, type PathShape } from '../actions/actions.ts';
import { DEFAULT_KEEP, editKept, keptInSlide, keptThrough, placesOf, spotsOf, withSpots, type Keep, type Kept, type Spots } from '../ik/drag.ts';
import type { SketchView } from '../sketch/project.ts';
import { newPresetId, poseFromPreset, presetPoseFrom, shownPresets, upsert, type ShownPreset } from '../presets/library.ts';

/** The flat stick-figure strip under the 3D view. */
export interface SketchState {
  open: boolean;
  view: SketchView;
  /** The strip's height, as a fraction of the stage's. */
  height: number;
}
export type { Units };

/** What made a state, for the history list. */
export interface Change {
  label: string;
  at: number;
}

interface Snapshot {
  combination: Combination;
  stepIndex: number;
  change: Change;
}

interface EditorState extends Snapshot {
  /** The fencer being posed. */
  active: FencerId;
  selected: JointName | null;
  units: Units;
  past: Snapshot[];
  future: Snapshot[];
  /** Jump to entry `index` of the history list (past, then now, then undone edits). */
  jumpTo: (index: number) => void;
  showHistory: boolean;
  toggleHistory: () => void;
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
  dragPose: (pose: Pose, dragId: number, from: DragFrom) => void;
  /** Where the things in `kept` belong for a drag of this fencer: remembered spots where there are any, else where they stand now. */
  spotsFor: (fencer: FencerId, kept: Kept[]) => Spots;
  /**
   * Shaping the movement into the current step: the poses are fixed and each
   * point's path can be bent by dragging its middle.
   */
  pathEdit: boolean;
  /** Start shaping the movement into step `index` (from the step before it). */
  editPath: (index: number) => void;
  exitPath: () => void;
  /** Pin (bend) or straighten (null) a fencer's path into the current step; a drag undoes as one. */
  setPins: (fencer: FencerId, pins: Pin[] | null, dragId?: number) => void;
  /** Stomach and chest bend as one spine (the default) or separately. */
  spineTogether: boolean;
  toggleSpineTogether: () => void;
  /** The movement last nudged (from a key or a button), so the controls can light it up. */
  lastNudge: { dofIndex: number; id: number } | null;
  /** The movement whose row in the joint controls the pointer is over; its guide shows its keys. */
  hotDof: number | null;
  setHotDof: (dofIndex: number | null) => void;
  /** Modifier keys currently held, shown in the controls. */
  held: { shift: boolean; alt: boolean };
  setHeld: (held: { shift: boolean; alt: boolean }) => void;
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
  /** What stays where it is while something else moves (editor state, never saved). */
  keep: Keep;
  toggleKeep: (key: keyof Keep) => void;
  /** The drag now in progress and the pose it last gave its fencer: anything else editing that fencer in between ends the drag. */
  dragging: { id: number; pose: Pose } | null;
  /** Set when the last key or typed edit was stopped short by something kept ("A’s feet are kept in place"); else null. */
  heldBack: string | null;
  sketch: SketchState;
  toggleSketch: () => void;
  setSketchView: (view: SketchView) => void;
  setSketchHeight: (height: number) => void;
  /** Whether drag handles show on the active fencer. */
  handles: boolean;
  toggleHandles: () => void;
  /** Move the active fencer along the piste, in metres toward their opponent. */
  advance: (metres: number) => void;
  setPosition: (x: number) => void;
  resetJoint: (joint: JointName) => void;
  /**
   * Bring the posing fencer's point to a target on the opponent, with the
   * arm alone (the feet stay). Says how far short it fell, in metres, and
   * whether that was from being too close.
   */
  pointTo: (area: TargetArea) => { short: number; close: boolean };
  /** Lay the posing fencer's blade against the opponent's, with the opponent's on their inside or outside. False (and nothing changes) when the blades are too far apart. */
  touchBlades: (where: 'inside' | 'outside') => boolean;
  /** Send the posing fencer's point under or over the opponent's blade on the way into this step, or straight ('direct'). */
  shapeActivePath: (shape: PathShape) => void;
  /** Give the posing fencer a saved pose, whole, where they stand. */
  applyPreset: (preset: PresetPose) => void;
  /** Back to the plain en garde, where they stand. */
  resetPose: () => void;
  /**
   * The view the coach is working in: wherever the camera was last left.
   * Editor state only, and the camera never moves unless the coach moves it,
   * playing or not. Students watch the whole combination from one view,
   * chosen on purpose with `setShot` (see `studentsView`).
   */
  view: StepCamera | null;
  /** The camera reports where it has come to rest (after a turn by hand, or a flight). */
  setView: (camera: StepCamera) => void;
  /** Where the camera should fly next (a chosen view, the step's shot, back from playing). */
  flight: { camera: StepCamera; id: number; save: boolean } | null;
  requestView: (camera: StepCamera) => void;
  /** Students watch the whole combination from the view the coach is in now. */
  setShot: () => void;
  /** Fly the working view to the students' view. */
  showShot: () => void;
  /** Forget the students' view: they get the plain side view. */
  clearShot: () => void;
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
  /** Copy a combination (the open one unless named) and open the copy. */
  duplicateCombination: (id?: string) => Promise<void>;
  renameCombination: (id: string, title: string) => Promise<void>;
  removeCombination: (id: string) => Promise<void>;
  /** Export everything (combinations and poses), or only the chosen combinations. */
  exportLibrary: (ids?: string[]) => Promise<void>;
  /** File a combination under a collection; '' leaves it unfiled. */
  setCollection: (id: string, collection: string) => Promise<void>;
  importLibrary: (text: string) => Promise<string>;
  connectFolder: () => Promise<string>;
  reconnectFolder: () => Promise<string>;
  disconnectFolder: () => Promise<void>;

  /** Save the posing fencer's pose under `name` ("Pose 3" and so on if none is given). Returns its id, so it can be renamed on the spot. */
  saveCurrentAsPreset: (name?: string) => string;
  /** Replace a saved pose with the posing fencer's pose now. */
  updatePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  removePreset: (id: string) => void;
  /** Put back a saved pose that was just deleted. */
  restorePreset: (preset: PresetPose) => void;
}

const HISTORY_LIMIT = 200;

/**
 * Where a fencer's kept things belong, remembered for each pose separately:
 * keys, typed angles, steps and drags all measure from here, so no run of
 * them can walk a kept foot away a little at a time. The memory belongs to
 * one pose object and counts only while that fencer's setup and the keep
 * switches are the very objects it was made with. This store replaces poses,
 * setups and switches, never changes them in place, so anything else that
 * touches the fencer (a pose click, an action, a pushed blade, a change of
 * build, a switch) leaves a pose with no memory, and editing the other
 * fencer, or the same fencer in another step, leaves this one's alone.
 * Editor memory only: it is never saved, and goes when its pose is dropped.
 */
interface KeptRef {
  setup: FencerSetup;
  keep: Keep;
  spots: Spots;
}
const keptMemory = new WeakMap<Pose, KeptRef>();

/** What a drag tells the store about itself with each move. */
export interface DragFrom {
  /** The fencer and the step the drag began on, and that fencer's pose at pointer-down. */
  fencer: FencerId;
  stepId: string;
  pose: Pose;
  /** Where its kept things belong (from `spotsFor`, taken at pointer-down). */
  spots?: Spots;
  /** The dot was stopped short of the pointer by something kept. */
  cut?: boolean;
}

/** The spots remembered for this fencer's present pose, if they were remembered with this setup and these switches. */
function spotsRemembered(s: EditorState, f: FencerId): Spots {
  const ref = keptMemory.get(currentStep(s).poses[f]);
  return ref && ref.setup === s.combination.fencers[f] && ref.keep === s.keep ? ref.spots : {};
}

/** Remember the kept spots for the pose `now` that `f` was just given; nothing to do if nothing was committed (`now` is still `was`). */
function rememberSpots(s: EditorState, f: FencerId, was: Pose, now: Pose, spots: Spots): void {
  if (now !== was) keptMemory.set(now, { setup: s.combination.fencers[f], keep: s.keep, spots });
}

const heldBackBy = (f: FencerId, kept: Kept[]) => {
  const names = [kept.some((k) => k.startsWith('foot')) && 'feet', kept.includes('hand') && 'hand', kept.includes('point') && 'point'].filter(Boolean);
  return `Held back: ${f}’s ${names.join(' and ')} ${names.length === 1 && names[0] !== 'feet' ? 'is' : 'are'} kept in place.`;
};

/**
 * A key, a typed angle, Straighten or a step along the piste asks for `next`.
 * The things in `kept` win: each is measured from its remembered spot, or
 * from where it is now if there is none; the edit is applied only as far as
 * keeps them all in place.
 */
function keyEdit(s: EditorState, next: Pose, kept: Kept[]): { pose: Pose; spots: Spots; heldBack: string | null } {
  if (!kept.length) return { pose: next, spots: {}, heldBack: null };
  const setup = activeSetup(s);
  const heading = HEADING[s.active];
  const current = activePose(s);
  const places = withSpots(placesOf(current, setup, heading), kept, spotsRemembered(s, s.active));
  const { pose, cut } = editKept(places, current, next, setup, heading);
  // Only what this edit kept is remembered: a limb the coach moved directly is placed afresh next time.
  return { pose, spots: spotsOf(places), heldBack: cut ? heldBackBy(s.active, kept) : null };
}

/** Commit a key edit: the blades check, history, and the kept spots remembered against the pose that was actually committed. */
function keyed(s: EditorState, held: ReturnType<typeof keyEdit>, key?: string): Partial<EditorState> {
  const f = s.active;
  const was = activePose(s);
  const done = edit(s, { combination: moved(s, held.pose) }, key);
  const now = done.combination ? done.combination.steps[s.stepIndex].poses[f] : was;
  rememberSpots(s, f, was, now, held.spots);
  return { ...done, heldBack: held.heldBack };
}

function rememberedLabels(): boolean {
  try {
    return localStorage.getItem('fencing-poser.labels') !== 'off';
  } catch {
    return true;
  }
}

/** A remembered editor preference, or `fallback` if there is none (or no storage). */
function remembered<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`fencing-poser.${key}`);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: object) {
  try {
    localStorage.setItem(`fencing-poser.${key}`, JSON.stringify(value));
  } catch {
    // Only a preference.
  }
}

const DEFAULT_SKETCH: SketchState = { open: true, view: 'side', height: 0.4 };

const COALESCE_MS = 1000;

export function currentStep(s: Snapshot): Step {
  return s.combination.steps[s.stepIndex];
}

/**
 * The one view students watch the combination from, if the coach has chosen
 * one (without it they get the plain side view). It is written to every
 * step, which is how saved combinations have always carried their views.
 */
export function studentsView(c: Combination): StepCamera | undefined {
  return c.steps.find((step) => step.camera)?.camera;
}

/** Older combinations may have a different view on different steps; choosing one again replaces them all. */
export function viewsDiffer(c: Combination): boolean {
  const first = JSON.stringify(c.steps[0].camera);
  return c.steps.some((step) => JSON.stringify(step.camera) !== first);
}

/** Is the coach's working view sitting on the students' view? */
export function viewIsShot(s: Pick<EditorState, 'view' | 'combination'>): boolean {
  const shot = studentsView(s.combination);
  if (!shot || !s.view) return false;
  // A flight lands within a few centimetres, not exactly.
  const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.05);
  return near(shot.position, s.view.position) && near(shot.target, s.view.target);
}

export function activePose(s: EditorState): Pose {
  return currentStep(s).poses[s.active];
}

export function activeSetup(s: EditorState): FencerSetup {
  return s.combination.fencers[s.active];
}

const snapshot = (s: EditorState): Snapshot => ({ combination: s.combination, stepIndex: s.stepIndex, change: s.change });

/** Record the current state in history before applying `next`; `label` names it (else read from what changed). */
function edit(state: EditorState, next: Partial<Snapshot>, key?: string, label?: string): Partial<EditorState> {
  const now = Date.now();
  // A drag stays one step however slowly it moves; other edits merge only in quick succession.
  const joined = key && state.lastEdit?.key === key && (key.startsWith('drag.') || now - state.lastEdit.at < COALESCE_MS);
  const said = label ?? (next.combination ? describeEdit(state.combination, next.combination) : 'Edit');
  // Nothing changed (a key pressed at a joint's limit, a pose applied twice): keep history clean.
  if (!said) return {};
  const combination = next.combination && { ...next.combination, updatedAt: new Date(now).toISOString() };
  return {
    ...next,
    ...(combination && { combination }),
    change: { label: said, at: now },
    past: joined ? state.past : [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
    future: [],
    lastEdit: key ? { key, at: now } : null,
    // Whatever was held back, this edit is another matter (those that are held back say so themselves).
    heldBack: null,
  };
}

function withSteps(c: Combination, steps: Step[]): Combination {
  return { ...c, steps };
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

function setSketch(s: EditorState, change: Partial<SketchState>): Partial<EditorState> {
  const sketch = { ...s.sketch, ...change };
  remember('sketch', sketch);
  return { sketch };
}

function fresh(combination: Combination): Partial<EditorState> {
  return {
    combination,
    stepIndex: 0,
    change: { label: 'Opened', at: Date.now() },
    past: [],
    future: [],
    lastEdit: null,
    selected: null,
    active: 'A',
    dragging: null,
    heldBack: null,
  };
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

  /** Before leaving the open combination: write it now if it has been edited, so the last moment's work is not lost to the autosave's wait. */
  const saveIfEdited = async () => {
    const s = get();
    if (s.loaded && s.past.length) await saveCombination(s.combination);
  };

  const first = newCombination();

  return {
    combination: first,
    stepIndex: 0,
    active: 'A',
    selected: null,
    units: 'metric',
    change: { label: 'New combination', at: Date.now() },
    past: [],
    future: [],
    lastEdit: null,
    showHistory: false,
    toggleHistory: () => set((s) => ({ showHistory: !s.showHistory })),
    jumpTo: (index) =>
      set((s) => {
        const all = [...s.past, snapshot(s), ...s.future];
        const target = all[index];
        if (!target || index === s.past.length) return {};
        return { ...target, past: all.slice(0, index), future: all.slice(index + 1), lastEdit: null, preview: null, heldBack: null };
      }),
    savedPresets: [],
    presets: shownPresets([]),
    library: [],
    loaded: false,
    folder: null,

    select: (selected, fencer) => set((s) => ({ selected, active: fencer ?? s.active, hotDof: null })),
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
        const spine = spineJoint(s, joint);
        const next = spine ? bendSpine(pose, dof, value - spineAngle(pose, dof)) : withAngle(pose, joint, dof, value);
        const held = keyEdit(s, next, keptThrough(activeSetup(s), s.keep, spine ? ['abdomen', 'chest'] : [joint]));
        return keyed(s, held, `${s.active}.${joint}.${dof}`);
      }),
    pathEdit: false,
    editPath: (index) => set({ stepIndex: index, pathEdit: true, selected: null, preview: null }),
    exitPath: () => set({ pathEdit: false }),
    setPins: (fencer, pins, dragId) =>
      set((s) =>
        edit(
          s,
          {
            combination: withStep(s, (st) => {
              const all = { ...st.pins };
              if (pins?.length) all[fencer] = [...pins].sort((p, q) => p.at - q.at);
              else delete all[fencer];
              // Older shaping (a halfway bend or pose) gives way to the pins.
              const bend = { ...st.bend };
              delete bend[fencer];
              const via = { ...st.via };
              delete via[fencer];
              return {
                ...st,
                pins: Object.keys(all).length ? all : undefined,
                bend: Object.keys(bend).length ? bend : undefined,
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
        const spine = spineJoint(s, s.selected);
        const next = spine
          ? bendSpine(current, dof.key, delta)
          : withAngle(current, s.selected, dof.key, angle(current, s.selected, dof.key) + delta);
        const held = keyEdit(s, next, keptThrough(activeSetup(s), s.keep, spine ? ['abdomen', 'chest'] : [s.selected]));
        return { ...keyed(s, held, `${s.active}.${s.selected}.${dof.key}`), lastNudge: { dofIndex, id: (s.lastNudge?.id ?? 0) + 1 } };
      }),
    lastNudge: null,
    hotDof: null,
    setHotDof: (hotDof) => set((s) => (s.hotDof === hotDof ? {} : { hotDof })),
    held: { shift: false, alt: false },
    setHeld: (held) => set((s) => (s.held.shift === held.shift && s.held.alt === held.alt ? {} : { held })),
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
    dragPose: (pose, dragId, from) =>
      set((s) => {
        const f = from.fencer;
        // Nothing is posed while the combination plays (Space pressed in the middle of a drag).
        if (s.preview) return {};
        // A drag ends once its fencer or step is no longer the one being posed...
        if (f !== s.active || from.stepId !== currentStep(s).id) return {};
        // ...or anything else has edited that fencer since the drag's last move (a key pressed mid-drag, undo).
        const was = currentStep(s).poses[f];
        if (was !== (s.dragging?.id === dragId ? s.dragging.pose : from.pose)) return {};
        const done = edit(s, { combination: moved(s, pose) }, `drag.${dragId}`);
        const now = done.combination ? done.combination.steps[s.stepIndex].poses[f] : was;
        if (from.spots) rememberSpots(s, f, was, now, from.spots);
        return { ...done, dragging: { id: dragId, pose: now }, heldBack: from.cut ? heldBackBy(f, Object.keys(from.spots ?? {}) as Kept[]) : null };
      }),
    spotsFor: (fencer, kept) => {
      const s = get();
      return spotsOf(withSpots(placesOf(currentStep(s).poses[fencer], s.combination.fencers[fencer], HEADING[fencer]), kept, spotsRemembered(s, fencer)));
    },
    keep: remembered('keep', DEFAULT_KEEP),
    dragging: null,
    heldBack: null,
    toggleKeep: (key) =>
      set((s) => {
        const keep = { ...s.keep, [key]: !s.keep[key] };
        remember('keep', keep);
        return { keep, heldBack: null };
      }),
    sketch: remembered('sketch', DEFAULT_SKETCH),
    toggleSketch: () => set((s) => setSketch(s, { open: !s.sketch.open })),
    setSketchView: (view) => set((s) => setSketch(s, { view })),
    setSketchHeight: (height) => set((s) => setSketch(s, { height })),
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
        // A step moves the feet with the fencer; a kept hand or point stays, the arm making up the difference.
        return keyed(s, keyEdit(s, { ...pose, root }, keptInSlide(s.keep)), `${s.active}.position`);
      }),
    resetJoint: (joint) =>
      set((s) => {
        const joints = { ...activePose(s).joints };
        delete joints[joint];
        // Like a typed angle: kept things stay, and the blades are checked.
        return keyed(s, keyEdit(s, { ...activePose(s), joints }, keptThrough(activeSetup(s), s.keep, [joint])));
      }),
    applyPreset: (preset) =>
      set((s) => {
        const to = poseFromPreset(preset, activeSetup(s).handedness, activePose(s));
        // Already in that pose: nothing for the history to record.
        if (!describeEdit(s.combination, moved(s, to))) return {};
        return edit(s, { combination: moved(s, to) }, undefined, `Step ${s.stepIndex + 1} · ${s.active}: ${preset.name}`);
      }),
    resetPose: () => {
      const s = get();
      const enGarde = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde');
      if (enGarde) s.applyPreset({ ...enGarde, name: 'Reset to en garde' });
    },
    pointTo: (area) => {
      const s = get();
      const f = s.active;
      const result = applyAction(s.combination, currentStep(s).poses, f, { kind: 'hit', area, with: 'arm' }, s.presets);
      const combination = withStep(s, (st) => ({ ...st, poses: result.poses }));
      set(edit(s, { combination }, undefined, `Step ${s.stepIndex + 1} · ${f}: point to the ${area}`));
      return { short: result.short ?? 0, close: !!result.close };
    },
    touchBlades: (where) => {
      const s = get();
      const f = s.active;
      const poses = touchBlades(s.combination, currentStep(s).poses, f, where);
      if (!poses) return false;
      set(edit(s, { combination: withStep(s, (st) => ({ ...st, poses })) }, undefined, `Step ${s.stepIndex + 1} · ${f}: blades touching`));
      return true;
    },
    shapeActivePath: (shape) => {
      const s = get();
      if (s.stepIndex === 0) return;
      s.setPins(s.active, shapePath(s.combination, s.stepIndex, s.active, shape));
    },
    view: null,
    setView: (view) => set({ view }),
    flight: null,
    requestView: (camera) => set((s) => ({ flight: { camera, id: (s.flight?.id ?? 0) + 1, save: true } })),
    setShot: () =>
      set((s) => {
        const camera = s.view;
        if (!camera) return {};
        const steps = s.combination.steps.map((step) => ({ ...step, camera }));
        return edit(s, { combination: { ...withSteps(s.combination, steps), sharedView: true } }, undefined, 'Students’ view chosen');
      }),
    showShot: () =>
      set((s) => {
        const camera = studentsView(s.combination);
        return camera ? { flight: { camera, id: (s.flight?.id ?? 0) + 1, save: false } } : {};
      }),
    clearShot: () =>
      set((s) => {
        if (!studentsView(s.combination)) return {};
        const steps = s.combination.steps.map(({ camera: _, ...step }): Step => step);
        return edit(s, { combination: withSteps(s.combination, steps) }, undefined, 'Students’ view back to the side');
      }),
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
          future: [snapshot(s), ...s.future],
          lastEdit: null,
          heldBack: null,
        };
      }),
    redo: () =>
      set((s) => {
        const [next, ...rest] = s.future;
        if (!next) return {};
        return {
          ...next,
          past: [...s.past, snapshot(s)],
          future: rest,
          lastEdit: null,
          heldBack: null,
        };
      }),

    goToStep: (index) =>
      set((s) => ({ stepIndex: Math.max(0, Math.min(s.combination.steps.length - 1, index)), lastEdit: null, pathEdit: false, heldBack: null })),
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
      await saveIfEdited();
      const c = await loadCombination(id);
      if (c) set(fresh(c));
    },
    createCombination: () => {
      void saveIfEdited();
      set(fresh(newCombination()));
    },
    duplicateCombination: async (id) => {
      await saveIfEdited();
      const source = !id || id === get().combination.id ? get().combination : await loadCombination(id);
      if (!source) return;
      const now = new Date().toISOString();
      const copy = { ...structuredClone(source), id: newId('combo'), title: `${source.title} (copy)`, createdAt: now, updatedAt: now };
      set(fresh(copy));
      await saveCombination(copy);
      await get().refreshLibrary();
      scheduleFolderWrite();
    },
    renameCombination: async (id, title) => {
      const name = title.trim();
      if (!name) return;
      if (get().combination.id === id) return get().setTitle(name);
      const c = await loadCombination(id);
      if (!c) return;
      await saveCombination({ ...c, title: name, updatedAt: new Date().toISOString() });
      // Saving another combination marks it last-open; keep the open one as last-open.
      await saveCombination(get().combination);
      await get().refreshLibrary();
      scheduleFolderWrite();
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
      const taken = new Set(s.savedPresets.map((p) => p.name));
      let n = s.savedPresets.length + 1;
      while (taken.has(`Pose ${n}`)) n++;
      const called = name?.trim() || `Pose ${n}`;
      const preset = {
        id: newPresetId(called),
        name: called,
        builtIn: false,
        pose: presetPoseFrom(activePose(s), activeSetup(s).handedness),
        updatedAt: new Date().toISOString(),
      };
      storePresets([...s.savedPresets, preset]);
      return preset.id;
    },
    updatePreset: (id) => {
      const s = get();
      const preset = s.savedPresets.find((p) => p.id === id);
      if (!preset) return;
      const pose = presetPoseFrom(activePose(s), activeSetup(s).handedness);
      storePresets(upsert(s.savedPresets, { ...preset, pose, updatedAt: new Date().toISOString() }));
    },
    renamePreset: (id, name) => {
      const { savedPresets } = get();
      const preset = savedPresets.find((p) => p.id === id);
      if (!preset || !name.trim() || name.trim() === preset.name) return;
      storePresets(upsert(savedPresets, { ...preset, name: name.trim(), updatedAt: new Date().toISOString() }));
    },
    removePreset: (id) => storePresets(get().savedPresets.filter((p) => p.id !== id)),
    restorePreset: (preset) => storePresets(upsert(get().savedPresets, preset)),
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

// The "held back" line is about one fencer in one step: it goes when either changes.
useEditor.subscribe((s, prev) => {
  if (!s.heldBack) return;
  const moved = s.active !== prev.active || s.combination.id !== prev.combination.id || currentStep(s).id !== currentStep(prev).id;
  if (moved || s.combination.fencers !== prev.combination.fencers) useEditor.setState({ heldBack: null });
});
