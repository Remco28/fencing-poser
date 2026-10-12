import { describe, expect, it } from 'vitest';
import { newCombination } from '../model/combination.ts';
import { libraryFile, mergeLibrary, parseLibraryFile } from './backup.ts';

const at = (iso: string) => ({ ...newCombination(new Date(iso)), updatedAt: iso });

describe('library backup', () => {
  it('round-trips through a file', () => {
    const c = newCombination();
    const file = parseLibraryFile(JSON.stringify(libraryFile([], [c])));
    expect(file?.combinations[0]).toEqual(c);
  });

  it('rejects files that are not a library', () => {
    expect(parseLibraryFile('{"hello": 1}')).toBeNull();
    expect(parseLibraryFile('not json')).toBeNull();
  });

  it('never replaces newer work with an older copy', () => {
    const mine = at('2026-10-12T10:00:00.000Z');
    const older = { ...mine, title: 'old', updatedAt: '2026-10-01T00:00:00.000Z' };
    const newer = { ...mine, title: 'new', updatedAt: '2026-10-20T00:00:00.000Z' };
    const brandNew = at('2026-10-05T00:00:00.000Z');

    const keep = mergeLibrary(libraryFile([], [older, brandNew]), [], [mine]);
    expect(keep.combinations).toEqual([brandNew]);
    expect(keep.keptNewer).toBe(1);
    expect(keep.added).toBe(1);

    const take = mergeLibrary(libraryFile([], [newer]), [], [mine]);
    expect(take.combinations).toEqual([newer]);
    expect(take.updated).toBe(1);
  });
});
