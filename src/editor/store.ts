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
import { tweenPose } from '../model/tween.ts';
import { angle, type FencerSetup, type Pose } from '../model/types.ts';
import type { PresetPose } from '../presets/builtin.ts';
import { advance, keyAt } from '../viewer/player.ts';
import { pushBlades } from '../ik/blades.ts';
import { actionLabel, applyAction, shapePath, type Action, type HitWith, type PathShape } from '../actions/actions.ts';
import { DEFAULT_KEEP, keepInPlace, type Keep } from '../ik/drag.ts';
import type { SketchView } from '../sketch/project.ts';
import { newPresetId, poseFromPreset, presetPoseFrom, shownPresets, upsert, type PosePart, type ShownPreset } from '../presets/library.ts';

export type PresetPart = PosePart;

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
  dragPose: (pose: Pose, dragId: number) => void;
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
  /** What stays where it is while something else moves (editor state, never saved). */
  keep: Keep;
  toggleKeep: (key: keyof Keep) => void;
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
  /** Apply a preset to the other fencer, without switching to them. */
  applyPresetToOther: (preset: PresetPose) => void;
  /**
   * The posing fencer performs a named action (one undo step). Names the step
   * for it and highlights a target that is hit. Says how far short a hit fell
   * in metres (and whether that was from being too close), or that the blades
   * were too far apart to meet, in which case nothing changed.
   */
  act: (action: Action) => { short: number; close: boolean; apart: boolean };
  /** Each action (but a distance) is added as a new step after the current one. Remembered. */
  actionsNewStep: boolean;
  toggleActionsNewStep: () => void;
  /** What the Hit buttons hit with (for the session). */
  hitWith: HitWith;
  setHitWith: (hitWith: HitWith) => void;
  /** Send the posing fencer's point under or over the opponent's blade on the way into this step, or straight ('direct'). */
  shapeActivePath: (shape: PathShape) => void;
  /** Apply a preset to the whole body, or only the upper body or the legs. */
  applyPreset: (preset: PresetPose, part?: PresetPart) => void;
  presetPart: PresetPart;
  setPresetPart: (part: PresetPart) => void;
  /**
   * The last pose click, kept so it can be dialled back ("halfway to a
   * lunge"). It holds only while both fencers are exactly as that click (or
   * the dial) left them; see `poseDial`.
   */
  dial: Dial | null;
  /** How far the last pose click is applied: 0 = the pose before it, 1 = all of it. One undo step with the click. */
  setPoseAmount: (amount: number) => void;
  /**
   * Give the posing fencer the pose a fencer had in another step (their own
   * unless `from` names the other, whose pose is mirrored as needed). Like
   * any pose: the part chosen, where they stand kept, and it can be dialled.
   */
  applyStepPose: (stepIndex: number, from?: FencerId) => void;
  /**
   * The view the coach is working in: wherever the camera was last left.
   * Editor state only. What students see for a step (its "shot",
   * `step.camera`) is set on purpose with `setShot`, never by looking around.
   */
  view: StepCamera | null;
  /** The camera reports where it has come to rest (after a turn by hand, or a flight). */
  setView: (camera: StepCamera) => void;
  /** Where the camera should fly next (a chosen view, the step's shot, back from playing). */
  flight: { camera: StepCamera; id: number; save: boolean } | null;
  requestView: (camera: StepCamera) => void;
  /** Use the working view as what students see for this step (for every step, with one view for all). */
  setShot: () => void;
  /** Fly the working view to what students see for this step. */
  showShot: () => void;
  /** Forget this step's shot: students get the plain side view. */
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

/** A pose click that can still be dialled back. */
interface Dial {
  id: number;
  name: string;
  /** Both fencers before the click, and the posing fencer's pose with all of it applied. */
  before: Record<FencerId, Pose>;
  to: Pose;
  /** Both fencers as the click or the dial last left them. */
  now: Record<FencerId, Pose>;
  amount: number;
}

let dials = 0;

/** The pose that can be dialled now: its name and how far it is applied (0 to 1); null once anything else has moved a fencer. */
export function poseDial(s: Pick<EditorState, 'dial' | 'combination' | 'stepIndex'>): { name: string; amount: number } | null {
  const d = s.dial;
  const poses = s.combination.steps[s.stepIndex]?.poses;
  if (!d || !poses || poses.A !== d.now.A || poses.B !== d.now.B) return null;
  return { name: d.name, amount: d.amount };
}

/** A step label written by an action: "A: Beat 6". */
const AUTO_LABEL = /^[AB]: /;

/** The step label after `part` is added: set when empty, appended when made only of such parts, else the coach's own. */
export function labelWith(label: string, part: string): string {
  if (!label.trim()) return part;
  return label.split(' · ').every((p) => AUTO_LABEL.test(p)) ? `${label} · ${part}` : label;
}

function rememberedFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`fencing-poser.${key}`);
    return v === null ? fallback : v === 'on';
  } catch {
    return fallback;
  }
}

function rememberFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(`fencing-poser.${key}`, on ? 'on' : 'off');
  } catch {
    // Only a preference.
  }
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

/** Has what students see for this step been set? (Without one they get the plain side view.) */
export function hasShot(step: Step): boolean {
  return !!step.camera;
}

/** Is the coach's working view sitting on what students see for the current step? */
export function viewIsShot(s: Pick<EditorState, 'view' | 'combination' | 'stepIndex'>): boolean {
  const shot = s.combination.steps[s.stepIndex].camera;
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
        return { ...target, past: all.slice(0, index), future: all.slice(index + 1), lastEdit: null, preview: null };
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
        const kept = keepInPlace(pose, next, activeSetup(s), HEADING[s.active], s.keep, spine ? ['abdomen', 'chest'] : [joint]);
        return edit(s, { combination: moved(s, kept) }, `${s.active}.${joint}.${dof}`);
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
        const pose = keepInPlace(current, next, activeSetup(s), HEADING[s.active], s.keep, spine ? ['abdomen', 'chest'] : [s.selected]);
        return {
          ...edit(s, { combination: moved(s, pose) }, `${s.active}.${s.selected}.${dof.key}`),
          lastNudge: { dofIndex, id: (s.lastNudge?.id ?? 0) + 1 },
        };
      }),
    lastNudge: null,
    hotDof: null,
    setHotDof: (hotDof) => set((s) => (s.hotDof === hotDof ? {} : { hotDof })),
    held: { shift: false, alt: false },
    setHeld: (held) => set((s) => (s.held.shift === held.shift && s.held.alt === held.alt ? {} : { held })),
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
    keep: remembered('keep', DEFAULT_KEEP),
    toggleKeep: (key) =>
      set((s) => {
        const keep = { ...s.keep, [key]: !s.keep[key] };
        remember('keep', keep);
        return { keep };
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
        return edit(s, { combination: moved(s, { ...pose, root }) }, `${s.active}.position`);
      }),
    resetJoint: (joint) =>
      set((s) => {
        const joints = { ...activePose(s).joints };
        delete joints[joint];
        return edit(s, { combination: withPose(s, { ...activePose(s), joints }) });
      }),
    applyPreset: (preset, part = get().presetPart) => {
      const s = get();
      const before = currentStep(s).poses;
      const to = poseFromPreset(preset, activeSetup(s).handedness, activePose(s), part);
      const id = ++dials;
      // The click and any dialling after it are one undo step.
      set(edit(s, { combination: moved(s, to) }, `drag.pose.${id}`, `Step ${s.stepIndex + 1} · ${s.active}: ${preset.name}`));
      set({ dial: { id, name: preset.name, before, to, now: currentStep(get()).poses, amount: 1 } });
    },
    dial: null,
    setPoseAmount: (amount) => {
      const s = get();
      const d = s.dial;
      if (!d || !poseDial(s)) return;
      const k = Math.min(1, Math.max(0, amount));
      const f = s.active;
      // Always worked out from the poses before the click, so dialling back and forth leaves no trace.
      const pose = k >= 1 ? d.to : k <= 0 ? d.before[f] : tweenPose(d.before[f], d.to, k);
      const poses = k <= 0 ? d.before : pushBlades(s.combination, d.before, { ...d.before, [f]: pose }, f);
      const label = `Step ${s.stepIndex + 1} · ${f}: ${d.name}${k < 1 ? ` ${Math.round(k * 100)}%` : ''}`;
      set(edit(s, { combination: withStep(s, (st) => ({ ...st, poses })) }, `drag.pose.${d.id}`, label));
      set({ dial: { ...d, now: currentStep(get()).poses, amount: k } });
    },
    applyStepPose: (stepIndex, from) => {
      const s = get();
      const source = s.combination.steps[stepIndex];
      const who = from ?? s.active;
      if (!source || (stepIndex === s.stepIndex && who === s.active)) return;
      s.applyPreset({
        id: `step-${source.id}-${who}`,
        name: `${who === s.active ? 'Pose' : `${who}’s pose`} from step ${stepIndex + 1}`,
        builtIn: false,
        pose: presetPoseFrom(source.poses[who], s.combination.fencers[who].handedness),
      });
    },
    applyPresetToOther: (preset) =>
      set((s) => {
        const f: FencerId = s.active === 'A' ? 'B' : 'A';
        const step = currentStep(s);
        const pose = poseFromPreset(preset, s.combination.fencers[f].handedness, step.poses[f], s.presetPart);
        const after = pushBlades(s.combination, step.poses, { ...step.poses, [f]: pose }, f);
        return edit(s, { combination: withStep(s, (st) => ({ ...st, poses: after })) }, undefined, `Step ${s.stepIndex + 1} · ${f}: ${preset.name}`);
      }),
    act: (action) => {
      const s = get();
      const newStep = s.actionsNewStep && action.kind !== 'distance';
      // In new-step mode the action happens on a copy of this step, added after it.
      let base: Snapshot = snapshot(s);
      if (newStep) {
        const steps = [...s.combination.steps];
        steps.splice(s.stepIndex + 1, 0, copyStep(currentStep(s)));
        base = { ...base, combination: withSteps(s.combination, steps), stepIndex: s.stepIndex + 1 };
      }
      const f = s.active;
      const opp: FencerId = f === 'A' ? 'B' : 'A';
      const result = applyAction(base.combination, currentStep(base).poses, f, action, s.presets);
      // Blades too far apart to meet: nothing happens, and no step is added for it.
      if (result.apart) return { short: 0, close: false, apart: true };
      const short = result.short ?? 0;
      const part = `${f}: ${actionLabel(action)}`;
      const combination = withStep(base, (st) => {
        let next: Step = { ...st, poses: result.poses };
        if (action.kind !== 'distance') next = { ...next, label: labelWith(st.label, part) };
        if (action.kind === 'hit' && !short) {
          const targets = st.display?.targets ?? [];
          if (!targets.some((t) => t.fencer === opp && t.area === action.area)) {
            next = { ...next, display: { ...st.display, targets: [...targets, { fencer: opp, area: action.area }] } };
          }
        }
        return next;
      });
      set({
        ...edit(s, { combination, stepIndex: base.stepIndex }, undefined, `Step ${base.stepIndex + 1} · ${part}`),
        // Shaping the path into the old step makes no sense on a new one.
        ...(newStep && { pathEdit: false }),
      });
      return { short, close: !!result.close, apart: false };
    },
    actionsNewStep: rememberedFlag('actionsNewStep', false),
    toggleActionsNewStep: () =>
      set((s) => {
        rememberFlag('actionsNewStep', !s.actionsNewStep);
        return { actionsNewStep: !s.actionsNewStep };
      }),
    hitWith: 'arm',
    setHitWith: (hitWith) => set({ hitWith }),
    shapeActivePath: (shape) => {
      const s = get();
      if (s.stepIndex === 0) return;
      s.setPins(s.active, shapePath(s.combination, s.stepIndex, s.active, shape));
    },
    presetPart: 'all',
    setPresetPart: (presetPart) => set({ presetPart }),
    view: null,
    setView: (view) => set({ view }),
    flight: null,
    requestView: (camera) => set((s) => ({ flight: { camera, id: (s.flight?.id ?? 0) + 1, save: true } })),
    setShot: () =>
      set((s) => {
        const camera = s.view;
        if (!camera) return {};
        const combination = s.combination.sharedView
          ? withSteps(s.combination, s.combination.steps.map((step) => ({ ...step, camera })))
          : withStep(s, (step) => ({ ...step, camera }));
        return edit(s, { combination }, 'shot', s.combination.sharedView ? 'Students’ view, every step' : `Step ${s.stepIndex + 1} · students’ view`);
      }),
    showShot: () =>
      set((s) => {
        const camera = currentStep(s).camera;
        return camera ? { flight: { camera, id: (s.flight?.id ?? 0) + 1, save: false } } : {};
      }),
    clearShot: () =>
      set((s) => {
        if (!s.combination.steps.some((step, i) => step.camera && (s.combination.sharedView || i === s.stepIndex))) return {};
        const bare = ({ camera: _, ...step }: Step): Step => step;
        const combination = s.combination.sharedView
          ? withSteps(s.combination, s.combination.steps.map(bare))
          : withStep(s, bare);
        return edit(s, { combination }, undefined, s.combination.sharedView ? 'Students’ view cleared, every step' : `Step ${s.stepIndex + 1} · students’ view cleared`);
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

// Playing (or scrubbing) shows each step's shot, as students will see it.
// When it ends, the camera goes back to the view the coach was working in.
useEditor.subscribe((s, prev) => {
  if (!prev.preview || s.preview || !s.view) return;
  useEditor.setState({ flight: { camera: s.view, id: (s.flight?.id ?? 0) + 1, save: false } });
});
