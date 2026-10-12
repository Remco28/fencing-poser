import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { DEFAULT_SETUP, emptyPose, type FencerSetup, type Pose } from './types.ts';

export type FencerId = 'A' | 'B';
export const FENCERS: FencerId[] = ['A', 'B'];

/** A faces down the piste toward +X, B toward -X. */
export const HEADING: Record<FencerId, number> = { A: 0, B: 180 };

/** Which way is "forward" along the piste for each fencer. */
export const FORWARD: Record<FencerId, 1 | -1> = { A: 1, B: -1 };

export interface Step {
  id: string;
  label: string;
  notes: string;
  poses: Record<FencerId, Pose>;
}

export interface Combination {
  schemaVersion: 1;
  id: string;
  title: string;
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
  return { id: newId('step'), label: '', notes: '', poses: structuredClone(step.poses) };
}

/** Accepts anything parsed from JSON; returns a combination or null. */
export function asCombination(value: unknown): Combination | null {
  const c = value as Partial<Combination> | null;
  if (!c || c.schemaVersion !== 1 || typeof c.id !== 'string' || !Array.isArray(c.steps) || !c.fencers) return null;
  if (!c.steps.length || !c.steps.every((s) => s && s.poses?.A && s.poses?.B)) return null;
  return c as Combination;
}
