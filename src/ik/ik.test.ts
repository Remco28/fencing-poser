import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { enGardeAt } from '../model/combination.ts';
import { DEFAULT_SETUP } from '../model/types.ts';
import { jointAxis, jointPosition, solveRig } from '../rig/kinematics.ts';
import { dragHandle } from './ik.ts';

const pose = enGardeAt(0);

describe.each([
  ['fencer A, right-handed', DEFAULT_SETUP, 0],
  ['fencer B, right-handed', DEFAULT_SETUP, 180],
  ['fencer A, left-handed', { ...DEFAULT_SETUP, handedness: 'left' as const }, 0],
])('%s', (_, setup, heading) => {
  const before = solveRig(setup, pose, heading);
  const weapon = setup.handedness === 'right' ? 'r' : 'l';
  const forward = heading === 0 ? 1 : -1;

  it('puts the hand where it is dragged and keeps the blade on line', () => {
    const target = jointPosition(before, `wrist_${weapon}`).add(new Vector3(0.12 * forward, 0.08, 0));
    const after = solveRig(setup, dragHandle(pose, setup, heading, `hand_${weapon}`, target), heading);
    expect(jointPosition(after, `wrist_${weapon}`).distanceTo(target)).toBeLessThan(0.01);
    const bladeBefore = before.tip.clone().sub(before.guard).normalize();
    const bladeAfter = after.tip.clone().sub(after.guard).normalize();
    expect(bladeAfter.dot(bladeBefore)).toBeGreaterThan(0.97);
  });

  it('moves a foot and keeps it flat', () => {
    const target = jointPosition(before, 'ankle_r').add(new Vector3(0.1 * forward, 0, 0));
    const after = solveRig(setup, dragHandle(pose, setup, heading, 'foot_r', target), heading);
    expect(jointPosition(after, 'ankle_r').distanceTo(target)).toBeLessThan(0.02);
    expect(jointAxis(after, 'ankle_r', [0, 1, 0]).y).toBeGreaterThan(0.98);
  });

  it('lowers the hips with the feet staying put', () => {
    const hips = jointPosition(before, 'pelvis');
    const target = hips.clone().add(new Vector3(0, -0.05, 0));
    const after = solveRig(setup, dragHandle(pose, setup, heading, 'hips', target), heading);
    expect(jointPosition(after, 'pelvis').distanceTo(target)).toBeLessThan(0.01);
    for (const s of ['r', 'l'] as const) {
      expect(jointPosition(after, `ankle_${s}`).distanceTo(jointPosition(before, `ankle_${s}`))).toBeLessThan(0.02);
    }
  });

  it('aims the point at a target', () => {
    const target = before.tip.clone().add(new Vector3(0, 0.2, 0.15));
    const after = solveRig(setup, dragHandle(pose, setup, heading, 'point', target), heading);
    const w = jointPosition(after, `wrist_${weapon}`);
    const aimDir = after.tip.clone().sub(w).normalize();
    expect(aimDir.dot(target.clone().sub(w).normalize())).toBeGreaterThan(0.995);
  });
});
