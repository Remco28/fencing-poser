import { createStore, del, entries, get, set } from 'idb-keyval';
import { asCombination, type Combination } from '../model/combination.ts';
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

export interface LibraryEntry {
  id: string;
  title: string;
  steps: number;
  updatedAt: string;
}

const COMBO = 'combo:';

async function attempt<T>(what: string, work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    console.warn(`Could not ${what} in this browser`, error);
    return fallback;
  }
}

export function loadPresets(): Promise<PresetPose[]> {
  return attempt(
    'load presets',
    async () => {
      const saved = await get<SavedPresets>('presets', db);
      return saved?.version === 1 ? saved.presets : [];
    },
    [],
  );
}

/** Resolves false when the browser refused to store (private window, storage blocked). */
export function savePresets(presets: PresetPose[]): Promise<boolean> {
  return attempt('save presets', () => set('presets', { version: 1, presets } satisfies SavedPresets, db).then(() => true), false);
}

export function saveCombination(combination: Combination): Promise<boolean> {
  return attempt(
    'save the combination',
    async () => {
      await set(COMBO + combination.id, combination, db);
      await set('lastOpen', combination.id, db);
      return true;
    },
    false,
  );
}

export function loadCombination(id: string): Promise<Combination | null> {
  return attempt('load the combination', async () => asCombination(await get(COMBO + id, db)), null);
}

export function deleteCombination(id: string): Promise<boolean> {
  return attempt('delete the combination', () => del(COMBO + id, db).then(() => true), false);
}

export function lastOpenId(): Promise<string | null> {
  return attempt('find the last combination', async () => (await get<string>('lastOpen', db)) ?? null, null);
}

export function listCombinations(): Promise<Combination[]> {
  return attempt(
    'list combinations',
    async () => {
      const all = await entries(db);
      return all
        .filter(([key]) => String(key).startsWith(COMBO))
        .map(([, value]) => asCombination(value))
        .filter((c): c is Combination => c !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    [],
  );
}

export function toEntry(c: Combination): LibraryEntry {
  return { id: c.id, title: c.title, steps: c.steps.length, updatedAt: c.updatedAt };
}
