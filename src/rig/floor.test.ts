import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { JOINTS, type JointName } from '../model/joints.ts';
import { DEFAULT_SETUP, type Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { lowestBodyPoint, solveRig, soleCorners } from './kinematics.ts';

/** Every visible surface point we can cheaply check: soles, plus each joint's ball. */
function lowest(pose: Pose): number {
  const rig = solveRig(DEFAULT_SETUP, pose);
  return Math.min(lowestBodyPoint(rig), ...soleCorners(rig.layout, rig.world).map((p) => p.y));
}

describe('nothing goes through the floor', () => {
  it('kneels on the back knee in a very deep lunge instead of sinking it', () => {
    const lunge = BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!.pose;
    const deep: Pose = {
      ...lunge,
      joints: { ...lunge.joints, knee_r: { flex: 150 }, hip_r: { ...lunge.joints.hip_r, flex: 120 }, knee_l: { flex: 120 } },
    };
    expect(lowest(deep)).toBeGreaterThanOrEqual(-1e-6);
    const rig = solveRig(DEFAULT_SETUP, deep);
    const knee = Math.min(new Vector3().setFromMatrixPosition(rig.world.knee_l).y, new Vector3().setFromMatrixPosition(rig.world.knee_r).y);
    expect(knee).toBeGreaterThan(0);
  });

  it('holds for a thousand random poses within the joint limits', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 1000; n++) {
      const joints: Pose['joints'] = {};
      for (const j of JOINTS) {
        const angles: Record<string, number> = {};
        for (const d of j.dofs) angles[d.key] = d.min + (d.max - d.min) * random();
        joints[j.name as JointName] = angles;
      }
      expect(lowest({ root: { x: 0, z: 0, lift: 0 }, joints })).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});
