import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Wood } from '../design.ts';

// Small textures drawn once in code: nothing to download, and cheap enough
// for a phone. Each is made the first time it is asked for and then kept.

/** The same "random" numbers every time, so a texture never changes between runs. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function finish(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

const kept = new Map<string, CanvasTexture>();

function once(key: string, make: () => CanvasTexture): CanvasTexture {
  let t = kept.get(key);
  if (!t) {
    t = make();
    kept.set(key, t);
  }
  return t;
}

/** Wood with a faint grain running along each limb. */
export function woodGrain(wood: Wood): CanvasTexture {
  return once(`wood ${wood.base}`, () => {
    const size = 256;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = canvas.getContext('2d')!;
    g.fillStyle = wood.base;
    g.fillRect(0, 0, size, size);
    const rnd = seeded(7);
    g.strokeStyle = wood.streak;
    for (let i = 0; i < 46; i++) {
      const x = rnd() * size;
      const sway = rnd() * 5;
      g.globalAlpha = 0.05 + rnd() * 0.13;
      g.lineWidth = 0.6 + rnd() * 2.4;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + sway, size / 3, x - sway, (2 * size) / 3, x, size);
      g.stroke();
    }
    return finish(canvas);
  });
}

/** Felt: white with dark flecks, tinted by the material's colour. */
export function feltNap(): CanvasTexture {
  return once('felt', () => {
    const size = 128;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    const rnd = seeded(11);
    g.fillStyle = '#000000';
    for (let i = 0; i < 2600; i++) {
      g.globalAlpha = rnd() * 0.16;
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
    return finish(canvas);
  });
}

/** The desk top: a pale surface with long, very faint streaks. */
export function deskTop(base: string, streak: string): CanvasTexture {
  return once(`desk ${base}`, () => {
    const size = 512;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = canvas.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    const rnd = seeded(23);
    g.strokeStyle = streak;
    for (let i = 0; i < 90; i++) {
      const y = rnd() * size;
      g.globalAlpha = rnd() * 0.07;
      g.lineWidth = 0.5 + rnd() * 2;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(size / 3, y + rnd() * 4 - 2, (2 * size) / 3, y + rnd() * 4 - 2, size, y);
      g.stroke();
    }
    const t = finish(canvas);
    t.repeat.set(5, 9);
    return t;
  });
}
