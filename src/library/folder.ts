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
