import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { copyStep, enGardeAt, HEADING, newCombination } from '../model/combination.ts';
import { curvePose } from '../model/tween.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { solveRig } from '../rig/kinematics.ts';
import { frameAt } from '../viewer/player.ts';
import { pathMiddle, shapePath } from './path.ts';

function feintToLunge() {
  const c = newCombination();
  c.steps[0].poses = { A: enGardeAt(-1.3), B: enGardeAt(1.3) };
  const lunge = copyStep(c.steps[0]);
  lunge.poses.A = { ...BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!.pose, root: { x: -0.85, z: 0, lift: 0 } };
  c.steps.push(lunge);
  return c;
}

describe('shaping a path', () => {
  it('curves through the halfway pose and still starts and ends on the steps', () => {
    const a = { root: { x: 0, z: 0, lift: 0 }, joints: { elbow_r: { flex: 0 } } };
    const via = { root: { x: 0.5, z: 0, lift: 0 }, joints: { elbow_r: { flex: 100 } } };
    const b = { root: { x: 1, z: 0, lift: 0 }, joints: { elbow_r: { flex: 20 } } };
    expect(curvePose(a, via, b, 0).joints.elbow_r?.flex).toBeCloseTo(0);
    expect(curvePose(a, via, b, 0.5).joints.elbow_r?.flex).toBeCloseTo(100);
    expect(curvePose(a, via, b, 1).joints.elbow_r?.flex).toBeCloseTo(20);
  });

  it('sends the point through where the middle of its path is dragged, keeping both steps', () => {
    const c = feintToLunge();
    const middle = pathMiddle(c, 1, 'A', (pos) => frameAt(c, pos));
    const lower = middle.clone().add(new Vector3(0, -0.25, 0.1));
    const via = shapePath(c, 1, 'A', lower);
    const shaped = { ...c, steps: [c.steps[0], { ...c.steps[1], via: { A: via } }] };
    const tip = solveRig(c.fencers.A, frameAt(shaped, 0.5).poses.A, HEADING.A).tip;
    expect(tip.distanceTo(lower)).toBeLessThan(0.03);
    // The ends do not move.
    expect(frameAt(shaped, 0).poses.A).toEqual(c.steps[0].poses.A);
    expect(frameAt(shaped, 1).poses.A).toEqual(c.steps[1].poses.A);
  });
});
