import { asCombination, newId, type Combination, type Step } from '../model/combination.ts';
import type { Pose } from '../model/types.ts';

// A shared combination travels inside the link, after the '#'. Browsers never
// send that part to a server, so nothing the coach shares is stored online:
// the link is the data. Format: #c=1.<base64url of deflate-raw JSON>. The
// "1." is the format version, so later versions can still open old links.

const PREFIX = '#c=1.';

const round = (n: number, step: number) => Math.round(n / step) * step;
const r2 = (n: number) => +round(n, 0.01).toFixed(2);

function compactPose(p: Pose) {
  const joints: Record<string, Record<string, number>> = {};
  for (const [joint, dofs] of Object.entries(p.joints)) {
    const kept: Record<string, number> = {};
    for (const [k, v] of Object.entries(dofs ?? {})) if (v !== undefined && Math.abs(v) >= 0.25) kept[k] = round(v, 0.5);
    if (Object.keys(kept).length) joints[joint] = kept;
  }
  const root: Record<string, number> = { x: r2(p.root.x) };
  if (p.root.z) root.z = r2(p.root.z);
  if (p.root.lift) root.lift = r2(p.root.lift);
  return { root, joints };
}

function compactStep(s: Step) {
  return {
    label: s.label || undefined,
    notes: s.notes || undefined,
    poses: { A: compactPose(s.poses.A), B: compactPose(s.poses.B) },
    camera: s.camera && { position: s.camera.position.map(r2), target: s.camera.target.map(r2) },
    display: s.display && Object.keys(s.display).length ? s.display : undefined,
    motionOnly: s.motionOnly || undefined,
    durationMs: s.durationMs,
  };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function encodeCombination(c: Combination): Promise<string> {
  const data = { title: c.title, fencers: c.fencers, steps: c.steps.map(compactStep) };
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('deflate-raw'));
  return PREFIX + toBase64Url(bytes);
}

/** The combination in a link's hash, or null if there is none or it is damaged. */
export async function decodeCombination(hash: string): Promise<Combination | null> {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as {
      title: string;
      fencers: Combination['fencers'];
      steps: (Omit<Step, 'id' | 'label' | 'notes' | 'poses'> & {
        label?: string;
        notes?: string;
        poses: Record<'A' | 'B', { root: Partial<Pose['root']>; joints: Pose['joints'] }>;
      })[];
    };
    const pose = (p: { root: Partial<Pose['root']>; joints: Pose['joints'] }): Pose => ({
      root: { x: p.root.x ?? 0, z: p.root.z ?? 0, lift: p.root.lift ?? 0 },
      joints: p.joints ?? {},
    });
    const now = new Date().toISOString();
    return asCombination({
      schemaVersion: 1,
      id: newId('shared'),
      title: data.title,
      fencers: data.fencers,
      steps: data.steps.map((s) => ({
        ...s,
        id: newId('step'),
        label: s.label ?? '',
        notes: s.notes ?? '',
        poses: { A: pose(s.poses.A), B: pose(s.poses.B) },
      })),
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return null;
  }
}

export function isShareHash(hash: string): boolean {
  return hash.startsWith('#c=');
}

/** The page address without any hash, for building links. */
export function appAddress(): string {
  return location.href.split('#')[0];
}
