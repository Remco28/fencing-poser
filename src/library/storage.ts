import { createStore, get, set } from 'idb-keyval';
import type { PresetPose } from '../presets/builtin.ts';

// Everything the coach makes is kept in this browser's IndexedDB. This module
// is the only place that knows that, so a folder sync or a self-hosted server
// can replace it later without touching the editor.

const db = createStore('fencing-poser', 'library');

export interface SavedPresets {
  version: 1;
  /** Custom presets, plus edited copies of built-in ones (same id as the original). */
  presets: PresetPose[];
}

export async function loadPresets(): Promise<PresetPose[]> {
  try {
    const saved = await get<SavedPresets>('presets', db);
    return saved?.version === 1 ? saved.presets : [];
  } catch {
    return [];
  }
}

/** Resolves false when the browser refused to store (private window, storage blocked). */
export async function savePresets(presets: PresetPose[]): Promise<boolean> {
  try {
    await set('presets', { version: 1, presets } satisfies SavedPresets, db);
    return true;
  } catch (error) {
    console.warn('Could not save presets in this browser', error);
    return false;
  }
}
