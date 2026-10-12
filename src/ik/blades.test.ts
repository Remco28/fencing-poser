import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { enGardeAt, HEADING, newCombination } from '../model/combination.ts';
import { solveRig } from '../rig/kinematics.ts';
import { closestBetween, CONTACT, engage, pushBlades, touch } from './blades.ts';

const c = newCombination();
const close = { A: enGardeAt(-0.95), B: enGardeAt(0.95) };
const rigs = (p: typeof close) => ({
  A: solveRig(c.fencers.A, p.A, HEADING.A),
  B: solveRig(c.fencers.B, p.B, HEADING.B),
});
const gap = (p: typeof close) => {
  const r = rigs(p);
  return closestBetween(r.A.guard, r.A.tip, r.B.guard, r.B.tip);
};

describe('blade contact', () => {
  it('finds the closest points of two crossing segments', () => {
    const g = closestBetween(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), new Vector3(0, -1, 0.3), new Vector3(0, 1, 0.3));
    expect(g.distance).toBeCloseTo(0.3);
    expect(g.s).toBeCloseTo(0.5);
    expect(g.t).toBeCloseTo(0.5);
  });

  it('engages in sixte with the blades touching, on the mover’s outside', () => {
    const p = engage(c, close, 'A', 'sixte');
    const g = gap(p);
    expect(g.distance).toBeLessThan(CONTACT * 1.6);
    // A's blade lies to A's right (+Z for a right-hander facing +X) of B's.
    expect(g.c1.z - g.c2.z).toBeGreaterThan(0);
  });

  it('engages in quarte on the inside', () => {
    const g = gap(engage(c, close, 'A', 'quarte'));
    expect(g.distance).toBeLessThan(CONTACT * 1.6);
    expect(g.c1.z - g.c2.z).toBeLessThan(0);
  });

  it('pushes the other blade aside instead of passing through it', () => {
    const sixte = engage(c, close, 'A', 'sixte');
    const across = { ...sixte, A: engage(c, sixte, 'A', 'quarte').A };
    const pushed = pushBlades(c, sixte, across, 'A');
    expect(pushed.B).not.toEqual(sixte.B);
    // Still on the outside: A's blade did not go through B's.
    const g = gap(pushed);
    expect(g.c1.z - g.c2.z).toBeGreaterThan(-0.002);
  });

  it('leaves the other blade alone when they do not meet', () => {
    const far = { A: enGardeAt(-2.55), B: enGardeAt(2.55) };
    expect(pushBlades(c, far, far, 'A')).toBe(far);
  });

  it('brings the point onto a target in reach', () => {
    const { poses, short } = touch(c, close, 'A', 'arm');
    expect(short).toBe(0);
    expect(gap(poses).distance).toBeGreaterThan(0); // the point, not the blade, is what lands
  });

  it('says how far short a distant target is', () => {
    const { short } = touch(c, { A: enGardeAt(-2.55), B: enGardeAt(2.55) }, 'A', 'body');
    expect(short).toBeGreaterThan(1);
  });
});
