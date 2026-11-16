import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { enGardeAt, HEADING, newCombination } from '../model/combination.ts';
import { solveRig } from '../rig/kinematics.ts';
import { closestBetween, CONTACT, layAgainst, pushBlades, touch } from './blades.ts';

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

  // A's right is +Z; B stays still and A's blade is laid against B's.
  const right = new Vector3(0, 0, 1);
  const left = new Vector3(0, 0, -1);

  it('lays one blade against the other, touching, on the side asked for', () => {
    const laid = layAgainst(c, close, 'B', right, 'foible')!;
    expect(laid.B).toBe(close.B);
    const g = gap(laid);
    expect(g.distance).toBeLessThan(CONTACT * 1.6);
    expect(g.c1.z - g.c2.z).toBeGreaterThan(0);
    const other = gap(layAgainst(c, close, 'B', left, 'foible')!);
    expect(other.distance).toBeLessThan(CONTACT * 1.6);
    expect(other.c1.z - other.c2.z).toBeLessThan(0);
  });

  it('meets on the strong part or the weak part of the blade that holds still', () => {
    const forte = gap(layAgainst(c, close, 'B', right, 'forte')!);
    const foible = gap(layAgainst(c, close, 'B', right, 'foible')!);
    // t runs along B's blade from guard to point.
    expect(forte.t).toBeLessThan(foible.t);
  });

  it('cannot lay blades together that are too far apart', () => {
    expect(layAgainst(c, { A: enGardeAt(-2.55), B: enGardeAt(2.55) }, 'B', right, 'forte')).toBeNull();
  });

  it('pushes the other blade aside instead of passing through it', () => {
    const outside = layAgainst(c, close, 'B', right, 'foible')!;
    const across = { ...outside, A: layAgainst(c, outside, 'B', left, 'foible')!.A };
    const pushed = pushBlades(c, outside, across, 'A');
    expect(pushed.B).not.toEqual(outside.B);
    // Still on the same side: A's blade did not go through B's.
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

describe('leaning in to touch', () => {
  it('leans the body in when the arm alone falls short, and stays balanced', async () => {
    const { balanceOf } = await import('../rig/balance.ts');
    const upright = enGardeAt(0).joints.pelvis?.lean ?? 0;
    // Step A back until a touch only lands by leaning in.
    let found = null;
    for (let x = -0.9; x > -2 && !found; x -= 0.03) {
      const { poses, short } = touch(c, { A: enGardeAt(x), B: enGardeAt(0.95) }, 'A', 'body');
      if (short === 0 && (poses.A.joints.pelvis?.lean ?? 0) > upright) found = poses;
    }
    expect(found).not.toBeNull();
    expect(balanceOf(solveRig(c.fencers.A, found!.A, HEADING.A)).outside).toBe(0);
  });
});
