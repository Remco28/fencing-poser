import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import type { JointName } from './joints.ts';
import { DEFAULT_SETUP, emptyPose, type FencerSetup, type Pose } from './types.ts';

export type FencerId = 'A' | 'B';
export const FENCERS: FencerId[] = ['A', 'B'];

/** A faces down the piste toward +X, B toward -X. */
export const HEADING: Record<FencerId, number> = { A: 0, B: 180 };

/** Which way is "forward" along the piste for each fencer. */
export const FORWARD: Record<FencerId, 1 | -1> = { A: 1, B: -1 };

export type Vec3 = [number, number, number];

export interface StepCamera {
  position: Vec3;
  target: Vec3;
}

/** Parts of a fencer that can be highlighted as the target of an action. */
export type TargetArea = 'mask' | 'body' | 'arm' | 'hand' | 'leg' | 'foot';

export const TARGET_NAMES: Record<TargetArea, string> = {
  mask: 'Mask',
  body: 'Body',
  arm: 'Arm',
  hand: 'Hand',
  leg: 'Front leg',
  foot: 'Front foot',
};

/** The body parts that light up for a target area. Arm, leg and foot are on the weapon side. */
export function targetParts(area: TargetArea, setup: FencerSetup): JointName[] {
  const w = setup.handedness === 'right' ? 'r' : 'l';
  switch (area) {
    case 'mask':
      return ['neck'];
    case 'body':
      return ['pelvis', 'abdomen', 'chest'];
    case 'arm':
      return [`shoulder_${w}`, `elbow_${w}`];
    case 'hand':
      return [`wrist_${w}`];
    case 'leg':
      return [`hip_${w}`, `knee_${w}`];
    case 'foot':
      return [`ankle_${w}`];
  }
}

export interface StepDisplay {
  /** Show the distance between the fencers and from each point to the other fencer. */
  distance?: boolean;
  /** Show the previous step faintly behind this one. */
  ghost?: boolean;
  targets?: { fencer: FencerId; area: TargetArea }[];
}

/** One place a movement's path is pinned (see Step.pins). */
export interface Pin {
  /** How far through the movement, 0 (the step before) to 1 (this step). */
  at: number;
  joints: Pose['joints'];
}

export interface Step {
  id: string;
  label: string;
  notes: string;
  poses: Record<FencerId, Pose>;
  /** The view this step is shown from; the editor saves it as the coach looks around. */
  camera?: StepCamera;
  display?: StepDisplay;
  /**
   * How the movement into this step is bent, per fencer: up to three places
   * on the point's path, each pinned where the coach dragged it. A pin is a
   * moment in the movement (`at`, 0 to 1) and how much each arm joint turns
   * away from the plain movement there (degrees). Playback eases the turns
   * smoothly through every pin and back to nothing at both steps, so the
   * point passes through each pin and both steps keep their poses.
   */
  pins?: Partial<Record<FencerId, Pin[]>>;
  /**
   * Older shaping (a single pin halfway; read as one): how much each arm
   * joint turns away from the plain movement at its middle (degrees). The
   * change fades in from nothing at the step before to all of it halfway and
   * back to nothing here, so the point glides round (under the opponent's
   * blade, say) and passes exactly where it was dragged. Set by dragging the
   * middle of the point's path.
   */
  bend?: Partial<Record<FencerId, Pose['joints']>>;
  /**
   * Older shaping: a fencer's pose halfway
   * through it. Playback curves through it, so a point can go round the
   * opponent's blade instead of straight through. Set by dragging the
   * point's path; absent = the plain, direct movement.
   */
  via?: Partial<Record<FencerId, Pose>>;
  /**
   * Older combinations: a step used only to shape the movement, skipped when
   * stepping through. No longer offered (shaping the path replaces it), but
   * still played.
   */
  motionOnly?: boolean;
  /** Smooth playback: milliseconds to move into this step from the one before. */
  durationMs?: number;
}

export interface Combination {
  schemaVersion: 1;
  id: string;
  title: string;
  /** The collection it is filed under in the library ("Beginners", "Second intention"); none = unfiled. */
  collection?: string;
  /** One view for every step: moving the camera on any step moves it for all. */
  sharedView?: boolean;
  fencers: Record<FencerId, FencerSetup>;
  steps: Step[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Standing just behind the en garde lines (2 m either side of centre). The
 * pelvis sits about half a metre behind the front toes in en garde.
 */
export const START_X = 2.55;

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function enGardeAt(x: number): Pose {
  const preset = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')?.pose ?? emptyPose();
  return { joints: preset.joints, root: { x, z: 0, lift: 0 } };
}

export function newCombination(now = new Date()): Combination {
  return {
    schemaVersion: 1,
    id: newId('combo'),
    title: 'Untitled combination',
    fencers: { A: DEFAULT_SETUP, B: DEFAULT_SETUP },
    steps: [
      {
        id: newId('step'),
        label: 'En garde',
        notes: '',
        poses: { A: enGardeAt(-START_X), B: enGardeAt(START_X) },
      },
    ],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** A new step that starts exactly where `step` ended. */
export function copyStep(step: Step): Step {
  // Same view and display as the step it came from; highlighted targets belong to the step that made them.
  const { targets: _, ...display } = step.display ?? {};
  return {
    id: newId('step'),
    label: '',
    notes: '',
    poses: structuredClone(step.poses),
    camera: step.camera,
    display,
    durationMs: step.durationMs,
  };
}

/** Accepts anything parsed from JSON; returns a combination or null. */
/** Has the movement into this step been shaped at all? */
export function isShaped(step: Step): boolean {
  return !!(step.pins || step.bend || step.via);
}

export function asCombination(value: unknown): Combination | null {
  const c = value as Partial<Combination> | null;
  if (!c || c.schemaVersion !== 1 || typeof c.id !== 'string' || !Array.isArray(c.steps) || !c.fencers) return null;
  if (!c.steps.length || !c.steps.every((s) => s && s.poses?.A && s.poses?.B)) return null;
  return c as Combination;
}
