import { describe, expect, it } from 'vitest';
import { copyStep, newCombination } from '../model/combination.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { decodeCombination, encodeCombination } from './link.ts';

function sample() {
  const c = newCombination();
  const second = copyStep(c.steps[0]);
  second.label = 'Lunge';
  second.notes = 'Hand before foot';
  second.poses.A = { ...BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!.pose, root: { x: -1.234567, z: 0, lift: 0 } };
  second.camera = { position: [0.123, 1.5, 6], target: [0, 0.9, 0] };
  second.display = { distance: true, targets: [{ fencer: 'B', area: 'arm' }] };
  second.motionOnly = true;
  second.via = { A: { ...second.poses.A, joints: { ...second.poses.A.joints, elbow_r: { flex: 33 } } } };
  return { ...c, title: 'Feint disengage', steps: [c.steps[0], second] };
}

describe('share links', () => {
  it('round-trips a combination', async () => {
    const c = sample();
    const back = await decodeCombination(await encodeCombination(c));
    expect(back).not.toBeNull();
    expect(back!.title).toBe('Feint disengage');
    expect(back!.steps).toHaveLength(2);
    const [, s] = back!.steps;
    expect(s.label).toBe('Lunge');
    expect(s.notes).toBe('Hand before foot');
    expect(s.motionOnly).toBe(true);
    expect(s.via?.A?.joints.elbow_r).toEqual({ flex: 33 });
    expect(s.display).toEqual({ distance: true, targets: [{ fencer: 'B', area: 'arm' }] });
    expect(s.poses.A.root.x).toBeCloseTo(-1.23, 5);
    expect(s.poses.A.joints.knee_r).toEqual(c.steps[1].poses.A.joints.knee_r);
    expect(s.camera?.position[0]).toBeCloseTo(0.12, 5);
  });

  it('stays short enough to share', async () => {
    const c = sample();
    for (let i = 0; i < 6; i++) c.steps.push(copyStep(c.steps[1]));
    expect((await encodeCombination(c)).length).toBeLessThan(2500);
  });

  it('rejects damaged links', async () => {
    expect(await decodeCombination('#c=1.notreallydata')).toBeNull();
    expect(await decodeCombination('#something-else')).toBeNull();
  });
});

describe('tween', () => {
  it('passes halfway between two poses at the midpoint', async () => {
    const { tweenPose } = await import('../model/tween.ts');
    const a = { root: { x: 0, z: 0, lift: 0 }, joints: { elbow_r: { flex: 20 } } };
    const b = { root: { x: 1, z: 0, lift: 0 }, joints: { elbow_r: { flex: 80 }, knee_r: { flex: 40 } } };
    const mid = tweenPose(a, b, 0.5);
    expect(mid.root.x).toBe(0.5);
    expect(mid.joints.elbow_r?.flex).toBe(50);
    expect(mid.joints.knee_r?.flex).toBe(20);
  });
});
