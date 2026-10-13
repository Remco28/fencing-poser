import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, emptyPose } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { balanceOf } from './balance.ts';
import { solveRig } from './kinematics.ts';

const preset = (id: string) => BUILT_IN_PRESETS.find((p) => p.id === id)!.pose;
const balance = (pose = emptyPose()) => balanceOf(solveRig(DEFAULT_SETUP, pose));

describe('balance', () => {
  it('puts the centre of mass around the hips when standing', () => {
    const b = balance();
    expect(b.centre.y).toBeGreaterThan(0.5 * 1.78);
    expect(b.centre.y).toBeLessThan(0.6 * 1.78);
    expect(b.outside).toBe(0);
  });

  it.each(['en-garde', 'lunge', 'advance', 'retreat', 'extension', 'parry-4', 'parry-6'])('finds %s balanced', (id) => {
    expect(balance(preset(id)).outside).toBe(0);
  });

  it('warns when the body leans far past the feet', () => {
    const leaning = { ...emptyPose(), joints: { pelvis: { lean: 50 }, abdomen: { flex: 40 } } };
    expect(balance(leaning).outside).toBeGreaterThan(0.05);
  });
});
