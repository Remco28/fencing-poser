import { describe, expect, it } from 'vitest';
import { enGardeAt, newCombination, START_X } from '../model/combination.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { measure, viewFor } from './measure.ts';

const lunge = BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!.pose;

describe('measurements', () => {
  it('puts the front feet on the en garde lines at the start', () => {
    const c = newCombination();
    const m = measure(c, c.steps[0]);
    expect(m.feet.distance).toBeGreaterThan(3.8);
    expect(m.feet.distance).toBeLessThan(4.2);
    expect(m.reach.A.distance).toBeGreaterThan(1.5);
    expect(m.reach.A.distance).toBeCloseTo(m.reach.B.distance, 5);
  });

  it('closes steadily to a touch as a lunge slides in', () => {
    const c = newCombination();
    let last = Infinity;
    let touched = false;
    for (let x = -2.5; x < START_X - 0.5 && !touched; x += 0.02) {
      const step = { ...c.steps[0], poses: { A: { ...lunge, root: { x, z: 0, lift: 0 } }, B: enGardeAt(START_X) } };
      const d = measure(c, step).reach.A.distance;
      // Close in, the point can slide past an arm before it lands, so only far out must it close steadily.
      if (last > 0.15) expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
      touched = d < 0.01;
    }
    expect(touched).toBe(true);
  });
});

describe('views', () => {
  it('frames both fencers from the side', () => {
    const c = newCombination();
    const side = viewFor('side', c.steps[0]);
    expect(side.target[0]).toBeCloseTo(0);
    expect(side.position[2]).toBeGreaterThan(5);
  });
});
