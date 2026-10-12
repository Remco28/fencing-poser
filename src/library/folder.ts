import { createStore, del, get, set } from 'idb-keyval';

// Mirror the library to a JSON file in a folder the coach picks (Chrome,
// Edge; Brave once brave://flags/#file-system-access-api is enabled). The
// browser remembers the folder; reading or writing it may need the coach to
// grant permission again after a restart, which only a click can do.

const db = createStore('fencing-poser-folder', 'handles');
export const FOLDER_FILE = 'fencing-poser-library.json';

type Permission = 'granted' | 'denied' | 'prompt';

interface DirectoryHandle {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  keys(): AsyncIterable<string>;
  removeEntry(name: string): Promise<void>;
  queryPermission(options: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission(options: { mode: 'readwrite' }): Promise<Permission>;
}

interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'readwrite' }) => Promise<DirectoryHandle>;
  }
}

export function folderSyncAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export type FolderStatus = { name: string; ready: boolean } | null;

async function stored(): Promise<DirectoryHandle | null> {
  try {
    return (await get<DirectoryHandle>('folder', db)) ?? null;
  } catch {
    return null;
  }
}

export async function folderStatus(): Promise<FolderStatus> {
  const handle = await stored();
  if (!handle) return null;
  try {
    return { name: handle.name, ready: (await handle.queryPermission({ mode: 'readwrite' })) === 'granted' };
  } catch {
    return { name: handle.name, ready: false };
  }
}

/** Must run from a click. Resolves null if the coach cancels. */
export async function chooseFolder(): Promise<FolderStatus> {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ id: 'fencing-poser', mode: 'readwrite' });
    await set('folder', handle, db);
    return { name: handle.name, ready: true };
  } catch {
    return null;
  }
}

/** Must run from a click: asks the browser to let us use the remembered folder again. */
export async function reconnectFolder(): Promise<FolderStatus> {
  const handle = await stored();
  if (!handle) return null;
  try {
    return { name: handle.name, ready: (await handle.requestPermission({ mode: 'readwrite' })) === 'granted' };
  } catch {
    return { name: handle.name, ready: false };
  }
}

export async function forgetFolder(): Promise<void> {
  await del('folder', db);
}

/** The library file's text, or null if there is none yet or the folder is not ready. */
export async function readFolder(): Promise<string | null> {
  const handle = await stored();
  if (!handle) return null;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return null;
    const file = await (await handle.getFileHandle(FOLDER_FILE)).getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeFolder(text: string): Promise<boolean> {
  const handle = await stored();
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    const writable = await (await handle.getFileHandle(FOLDER_FILE, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch (error) {
    console.warn('Could not write the library folder', error);
    return false;
  }
}

/** Days of snapshots kept in the folder's backups/ subfolder. */
export const SNAPSHOT_DAYS = 14;

/**
 * Keep a copy of the library per day in backups/, so a bad edit or a bad
 * import can always be undone from a file. Today's copy is overwritten as
 * the day goes on; copies beyond the last SNAPSHOT_DAYS days are removed.
 */
export async function writeFolderSnapshot(text: string, today = new Date()): Promise<void> {
  const handle = await stored();
  if (!handle) return;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
    const backups = await handle.getDirectoryHandle('backups', { create: true });
    const name = `fencing-poser-library-${today.toISOString().slice(0, 10)}.json`;
    const writable = await (await backups.getFileHandle(name, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
    const snapshots: string[] = [];
    for await (const key of backups.keys()) if (/^fencing-poser-library-\d{4}-\d{2}-\d{2}\.json$/.test(key)) snapshots.push(key);
    snapshots.sort();
    for (const old of snapshots.slice(0, Math.max(0, snapshots.length - SNAPSHOT_DAYS))) await backups.removeEntry(old);
  } catch (error) {
    console.warn('Could not write the daily backup', error);
  }
}
