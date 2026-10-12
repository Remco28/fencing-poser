import { describe, expect, it } from 'vitest';
import type { JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { DEFAULT_SETUP, emptyPose, type Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { jointAxis, jointPosition, solveRig } from './kinematics.ts';

// Body frame: facing +X, up +Y, the fencer's right is +Z.
const OUT = { r: 1, l: -1 } as const;

function pose(joints: Pose['joints']): Pose {
  return { ...emptyPose(), joints };
}

function rel(p: Pose, from: JointName, to: JointName) {
  const rig = solveRig(DEFAULT_SETUP, p);
  return jointPosition(rig, to).sub(jointPosition(rig, from));
}

describe('standing at rest', () => {
  const rig = solveRig(DEFAULT_SETUP, emptyPose());

  it('stands on the floor at full height', () => {
    expect(jointPosition(rig, 'ankle_r').y).toBeCloseTo(0.039 * 1.78, 3);
    const headTop = jointPosition(rig, 'neck').y + 0.088 * 1.78 + 0.074 * 1.78;
    expect(headTop).toBeGreaterThan(1.72);
    expect(headTop).toBeLessThan(1.84);
  });

  it('puts the right side at +Z', () => {
    expect(jointPosition(rig, 'shoulder_r').z).toBeGreaterThan(0.1);
    expect(jointPosition(rig, 'hip_l').z).toBeLessThan(-0.05);
  });
});

describe.each(['r', 'l'] as const)('side %s moves anatomically', (s) => {
  it('flexes the shoulder forward', () => {
    expect(rel(pose({ [`shoulder_${s}`]: { flex: 90 } }), `shoulder_${s}`, `elbow_${s}`).x).toBeGreaterThan(0.3);
  });

  it('abducts the shoulder outward', () => {
    expect(rel(pose({ [`shoulder_${s}`]: { abduct: 90 } }), `shoulder_${s}`, `elbow_${s}`).z * OUT[s]).toBeGreaterThan(0.3);
  });

  it('twists the shoulder outward: a bent forearm swings out', () => {
    const p = pose({ [`elbow_${s}`]: { flex: 90 }, [`shoulder_${s}`]: { twist: 60 } });
    expect(rel(p, `elbow_${s}`, `wrist_${s}`).z * OUT[s]).toBeGreaterThan(0.1);
  });

  it('bends the elbow forward', () => {
    expect(rel(pose({ [`elbow_${s}`]: { flex: 90 } }), `elbow_${s}`, `wrist_${s}`).x).toBeGreaterThan(0.2);
  });

  it('flexes the hip forward', () => {
    expect(rel(pose({ [`hip_${s}`]: { flex: 90 } }), `hip_${s}`, `knee_${s}`).x).toBeGreaterThan(0.35);
  });

  it('abducts the hip outward', () => {
    expect(rel(pose({ [`hip_${s}`]: { abduct: 45 } }), `hip_${s}`, `knee_${s}`).z * OUT[s]).toBeGreaterThan(0.2);
  });

  it('twists the hip outward: the foot turns out', () => {
    const rig = solveRig(DEFAULT_SETUP, pose({ [`hip_${s}`]: { twist: 45 } }));
    expect(jointAxis(rig, `ankle_${s}`, [1, 0, 0]).z * OUT[s]).toBeGreaterThan(0.5);
  });

  it('bends the knee backward', () => {
    expect(rel(pose({ [`knee_${s}`]: { flex: 90 } }), `knee_${s}`, `ankle_${s}`).x).toBeLessThan(-0.3);
  });

  it('lifts the toes with ankle flex', () => {
    const rig = solveRig(DEFAULT_SETUP, pose({ [`ankle_${s}`]: { flex: 20 } }));
    expect(jointAxis(rig, `ankle_${s}`, [1, 0, 0]).y).toBeGreaterThan(0.3);
  });

  it('pronation turns the palm backward', () => {
    // At rest the palm faces the body: -Z on the right, +Z on the left.
    const rig = solveRig(DEFAULT_SETUP, pose({ [`wrist_${s}`]: { pronate: 90 } }));
    const palm = jointAxis(rig, `wrist_${s}`, [0, 0, -OUT[s]]);
    expect(palm.x).toBeLessThan(-0.9);
  });

  it('wrist flexion moves the hand toward the palm', () => {
    const rig = solveRig(DEFAULT_SETUP, pose({ [`wrist_${s}`]: { flex: 60 } }));
    expect(jointAxis(rig, `wrist_${s}`, [0, -1, 0]).z * -OUT[s]).toBeGreaterThan(0.7);
  });
});

describe('spine and pelvis', () => {
  it('bends the abdomen forward', () => {
    expect(rel(pose({ abdomen: { flex: 45 } }), 'abdomen', 'chest').x).toBeGreaterThan(0.1);
  });

  it('turns the pelvis right: the chest faces +Z', () => {
    const rig = solveRig(DEFAULT_SETUP, pose({ pelvis: { turn: 90 } }));
    expect(jointAxis(rig, 'chest', [1, 0, 0]).z).toBeGreaterThan(0.9);
  });

  it('turns the head right', () => {
    const rig = solveRig(DEFAULT_SETUP, pose({ neck: { turn: 60 } }));
    expect(jointAxis(rig, 'neck', [1, 0, 0]).z).toBeGreaterThan(0.8);
  });
});

describe('the épée', () => {
  it('runs along the hand, a little toward the thumb with a pistol grip', () => {
    const rig = solveRig(DEFAULT_SETUP, pose({ elbow_r: { flex: 90 } }));
    const dir = rig.tip.clone().sub(rig.guard).normalize();
    expect(dir.x).toBeGreaterThan(0.95);
    expect(dir.y).toBeGreaterThan(0.1);
  });

  it('is in the left hand for a left-hander', () => {
    const rig = solveRig({ ...DEFAULT_SETUP, handedness: 'left' }, emptyPose());
    expect(rig.guard.z).toBeLessThan(0);
  });
});

describe('mirroring', () => {
  it('turns a right-hander en garde into a left-hander en garde', () => {
    const preset = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')!.pose;
    const right = solveRig(DEFAULT_SETUP, preset);
    const left = solveRig({ ...DEFAULT_SETUP, handedness: 'left' }, mirrorPose(preset));
    expect(left.tip.x).toBeCloseTo(right.tip.x, 6);
    expect(left.tip.y).toBeCloseTo(right.tip.y, 6);
    expect(left.tip.z).toBeCloseTo(-right.tip.z, 6);
  });
});

describe('the en garde preset', () => {
  const rig = solveRig(DEFAULT_SETUP, BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')!.pose);

  it('has the front foot pointing at the opponent and ahead of the back foot', () => {
    expect(jointAxis(rig, 'ankle_r', [1, 0, 0]).x).toBeGreaterThan(0.9);
    expect(jointPosition(rig, 'ankle_r').x - jointPosition(rig, 'ankle_l').x).toBeGreaterThan(0.5);
  });

  it('holds the point forward and above the hand', () => {
    expect(rig.tip.x).toBeGreaterThan(1.2);
    expect(rig.tip.y).toBeGreaterThan(jointPosition(rig, 'wrist_r').y);
  });
});
