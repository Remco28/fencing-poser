import { Vector3 } from 'three';
import type { FencerId } from '../model/combination.ts';

// The sketch is a flat, orthographic drawing of the same fencers the 3D view
// shows. Flat coordinates are metres: u to the right, v up the screen, and
// depth toward the viewer (larger = nearer, drawn later).

export type SketchView = 'side' | 'above' | 'behind';

export interface Flat {
  u: number;
  v: number;
  depth: number;
}

/**
 * World to flat. `side` looks across the piste (A on the left), `above` looks
 * down on it (A on the left, the fencers' right sides toward the bottom), and
 * `behind` looks the way `facing` faces, from behind them.
 */
export function toFlat(view: SketchView, facing: FencerId, p: Vector3): Flat {
  switch (view) {
    case 'side':
      return { u: p.x, v: p.y, depth: p.z };
    case 'above':
      return { u: p.x, v: -p.z, depth: p.y };
    case 'behind':
      return facing === 'A' ? { u: p.z, v: p.y, depth: -p.x } : { u: -p.z, v: p.y, depth: p.x };
  }
}

/**
 * Flat to world. The coordinate along the line of sight is taken from `keep`
 * (where the dragged dot was), so a drag in a flat view never changes depth.
 */
export function toWorld(view: SketchView, facing: FencerId, u: number, v: number, keep: Vector3): Vector3 {
  switch (view) {
    case 'side':
      return new Vector3(u, v, keep.z);
    case 'above':
      return new Vector3(u, keep.y, -v);
    case 'behind':
      return facing === 'A' ? new Vector3(keep.x, v, u) : new Vector3(keep.x, v, -u);
  }
}
