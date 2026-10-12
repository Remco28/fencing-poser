import { describe, expect, it } from 'vitest';
import { copyStep, newCombination, type Combination } from '../model/combination.ts';
import { advance, frameAt, keyAt, keySteps, nextKey, prevKey } from './player.ts';

/** Four steps; the third is a via step. A's elbow flex is 0, 30, 60, 90 across them. */
function sample(): Combination {
  const c = newCombination();
  const steps = [c.steps[0]];
  for (let i = 1; i < 4; i++) steps.push(copyStep(steps[i - 1]));
  steps.forEach((s, i) => {
    s.poses.A = { ...s.poses.A, joints: { ...s.poses.A.joints, elbow_r: { flex: i * 30 } } };
    s.durationMs = 1000;
  });
  steps[2].motionOnly = true;
  return { ...c, steps };
}

describe('player', () => {
  const c = sample();

  it('stops only at key steps', () => {
    expect(keySteps(c)).toEqual([0, 1, 3]);
    expect(nextKey(c, 1)).toBe(3);
    expect(prevKey(c, 3)).toBe(1);
    expect(keyAt(c, 2.5)).toBe(1);
  });

  it('passes through a via step on the way to the next key step', () => {
    expect(frameAt(c, 2).poses.A.joints.elbow_r?.flex).toBe(60);
    expect(frameAt(c, 1.5).poses.A.joints.elbow_r?.flex).toBeCloseTo(45);
  });

  it('advances by each step’s duration and stops where asked', () => {
    expect(advance(c, 1, 500, 3)).toBeCloseTo(1.5);
    expect(advance(c, 1, 1500, 3)).toBeCloseTo(2.5);
    expect(advance(c, 1, 9000, 3)).toBe(3);
  });

  it('plays faster when a step is given less time', () => {
    const quick = { ...c, steps: c.steps.map((s, i) => (i === 1 ? { ...s, durationMs: 250 } : s)) };
    expect(advance(quick, 0, 250, 3)).toBeCloseTo(1);
  });
});
