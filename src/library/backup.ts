import { asCombination, type Combination } from '../model/combination.ts';
import type { PresetPose } from '../presets/builtin.ts';

/** The whole library in one file: the coach's backup and the way to move between browsers. */
export interface LibraryFile {
  app: 'fencing-poser';
  version: 1;
  exportedAt: string;
  presets: PresetPose[];
  combinations: Combination[];
}

export function libraryFile(presets: PresetPose[], combinations: Combination[], now = new Date()): LibraryFile {
  return { app: 'fencing-poser', version: 1, exportedAt: now.toISOString(), presets, combinations };
}

export function parseLibraryFile(text: string): LibraryFile | null {
  try {
    const data = JSON.parse(text) as Partial<LibraryFile>;
    if (data.app !== 'fencing-poser' || data.version !== 1) return null;
    return {
      app: 'fencing-poser',
      version: 1,
      exportedAt: String(data.exportedAt ?? ''),
      presets: Array.isArray(data.presets) ? data.presets.filter((p) => p && typeof p.id === 'string' && p.pose) : [],
      combinations: Array.isArray(data.combinations)
        ? data.combinations.map(asCombination).filter((c): c is Combination => c !== null)
        : [],
    };
  } catch {
    return null;
  }
}

export interface MergeResult {
  presets: PresetPose[];
  /** Combinations to write: new ones, and ones the file has a newer version of. */
  combinations: Combination[];
  /** Whether any preset came from the file. */
  presetsChanged: boolean;
  added: number;
  updated: number;
  keptNewer: number;
}

/**
 * Merging never throws away newer work: a combination in the file replaces
 * the one here only if the file's copy was changed more recently, and the
 * same goes for presets.
 */
export function mergeLibrary(
  file: LibraryFile,
  localPresets: PresetPose[],
  localCombinations: Combination[],
): MergeResult {
  const local = new Map(localCombinations.map((c) => [c.id, c]));
  const combinations: Combination[] = [];
  let added = 0;
  let updated = 0;
  let keptNewer = 0;
  for (const c of file.combinations) {
    const mine = local.get(c.id);
    if (!mine) {
      combinations.push(c);
      added++;
    } else if (c.updatedAt > mine.updatedAt) {
      combinations.push(c);
      updated++;
    } else if (c.updatedAt < mine.updatedAt) {
      keptNewer++;
    }
  }
  const presets = [...localPresets];
  let presetsChanged = false;
  for (const p of file.presets) {
    const i = presets.findIndex((q) => q.id === p.id);
    if (i < 0) presets.push(p);
    else if ((p.updatedAt ?? '') > (presets[i].updatedAt ?? '')) presets[i] = p;
    else continue;
    presetsChanged = true;
  }
  return { presets, combinations, presetsChanged, added, updated, keptNewer };
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
