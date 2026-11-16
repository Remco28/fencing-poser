import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { toFlat, toWorld, type SketchView } from './project.ts';

const VIEWS: SketchView[] = ['side', 'above', 'behind'];
const POINTS = [new Vector3(0.3, 1.2, -0.4), new Vector3(-2.5, 0.05, 0.6), new Vector3(1.9, 1.7, 0)];

describe('sketch projection', () => {
  for (const view of VIEWS) {
    for (const facing of ['A', 'B'] as const) {
      it(`round-trips through the ${view} view (${facing})`, () => {
        for (const p of POINTS) {
          const { u, v } = toFlat(view, facing, p);
          expect(toWorld(view, facing, u, v, p).distanceTo(p)).toBeLessThan(1e-12);
        }
      });

      it(`keeps the depth of the held point in the ${view} view (${facing})`, () => {
        const keep = new Vector3(0.7, 1.1, -0.3);
        const moved = toWorld(view, facing, 2, 0.5, keep);
        expect(toFlat(view, facing, moved).depth).toBeCloseTo(toFlat(view, facing, keep).depth);
        expect(toFlat(view, facing, moved).u).toBeCloseTo(2);
        expect(toFlat(view, facing, moved).v).toBeCloseTo(0.5);
      });
    }
  }

  it('puts A on the left in the side and above views', () => {
    const a = new Vector3(-2, 1, 0);
    const b = new Vector3(2, 1, 0);
    for (const view of ['side', 'above'] as const) expect(toFlat(view, 'A', a).u).toBeLessThan(toFlat(view, 'A', b).u);
  });

  it('looks the way the posing fencer faces from behind them', () => {
    const right = new Vector3(0, 1, 0.3); // A's right side at heading 0
    expect(toFlat('behind', 'A', right).u).toBeGreaterThan(0);
    // B faces -X, so its right is -Z, and screen right is its right too.
    expect(toFlat('behind', 'B', new Vector3(0, 1, -0.3)).u).toBeGreaterThan(0);
    // The opponent, ahead of the posing fencer, is further away.
    expect(toFlat('behind', 'A', new Vector3(2, 1, 0)).depth).toBeLessThan(toFlat('behind', 'A', new Vector3(-2, 1, 0)).depth);
    expect(toFlat('behind', 'B', new Vector3(-2, 1, 0)).depth).toBeLessThan(toFlat('behind', 'B', new Vector3(2, 1, 0)).depth);
  });

  it('shows the fencer’s right side toward the bottom from above, and up as up from the side', () => {
    expect(toFlat('above', 'A', new Vector3(0, 0, 0.5)).v).toBeLessThan(0);
    expect(toFlat('side', 'A', new Vector3(0, 1.5, 0)).v).toBeGreaterThan(toFlat('side', 'A', new Vector3(0, 0.2, 0)).v);
  });
});
