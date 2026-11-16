import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { enGardeAt } from '../model/combination.ts';
import { clampDof, JOINT_NAMES, type JointName } from '../model/joints.ts';
import { mirrorPose } from '../model/mirror.ts';
import { DEFAULT_SETUP, type FencerSetup, type Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';
import { DOTS, dotPositions, dragDot, headCentre, keepInPlace, type Dot, type Keep } from './drag.ts';

const FEET: Keep = { feet: true, hand: false, point: false };
const NONE: Keep = { feet: false, hand: false, point: false };

function withinLimits(p: Pose) {
  for (const name of JOINT_NAMES)
    for (const [dof, v] of Object.entries(p.joints[name] ?? {})) {
      expect(Number.isFinite(v), `${name}.${dof} is ${v}`).toBe(true);
      expect(clampDof(name, dof, v!)).toBeCloseTo(v!, 6);
    }
  expect(Number.isFinite(p.root.x) && Number.isFinite(p.root.z)).toBe(true);
}

function setJoint(p: Pose, joint: JointName, dof: string, v: number): Pose {
  return { ...p, joints: { ...p.joints, [joint]: { ...p.joints[joint], [dof]: v } } };
}

describe.each([
  ['fencer A, right-handed', DEFAULT_SETUP, 0],
  ['fencer B, right-handed', DEFAULT_SETUP, 180],
  ['fencer A, left-handed', { ...DEFAULT_SETUP, handedness: 'left' as const } as FencerSetup, 0],
])('%s', (_, setup, heading) => {
  // A left-hander stands mirrored, as the editor mirrors their poses.
  const pose = setup.handedness === 'right' ? enGardeAt(0) : mirrorPose(enGardeAt(0));
  const build = (p: Pose) => solveRig(setup, p, heading);
  const before = build(pose);
  const w = setup.handedness === 'right' ? 'r' : 'l';
  const front = w;
  const back = w === 'r' ? 'l' : 'r';
  const forward = new Vector3(heading === 0 ? 1 : -1, 0, 0);
  /** The fencer's right, horizontally. */
  const right = new Vector3(0, 0, heading === 0 ? 1 : -1);
  const outside = w === 'r' ? right : right.clone().negate();
  const at = (r: Rig, j: JointName) => jointPosition(r, j);
  const drag = (dot: Dot, target: Vector3, keep: Keep = FEET) => {
    const p = dragDot(pose, setup, heading, dot, target, keep);
    withinLimits(p);
    return build(p);
  };
  const along = (v: Vector3) => v.dot(forward);
  const feetStay = (after: Rig, sides: ('r' | 'l')[] = ['r', 'l'], tol = 0.02) => {
    for (const s of sides) expect(at(after, `ankle_${s}`).distanceTo(at(before, `ankle_${s}`))).toBeLessThan(tol);
  };
  /** Where the weapon hand gets to when the arm is straight, level with the wrist, straight ahead of the shoulder. */
  const armEnd = () => {
    const shoulder = at(before, `shoulder_${w}`);
    const wrist = at(before, `wrist_${w}`);
    const L = before.layout.upperArm + before.layout.forearm;
    const dy = wrist.y - shoulder.y;
    return shoulder.clone().setY(wrist.y).addScaledVector(forward, Math.sqrt(L * L - dy * dy));
  };

  it('puts the hand where it is dragged, blade on line', () => {
    const target = at(before, `wrist_${w}`).addScaledVector(forward, 0.12).add(new Vector3(0, 0.08, 0));
    const after = drag(`hand_${w}`, target);
    expect(at(after, `wrist_${w}`).distanceTo(target)).toBeLessThan(0.01);
    const blade0 = before.tip.clone().sub(before.guard).normalize();
    expect(after.tip.clone().sub(after.guard).normalize().dot(blade0)).toBeGreaterThan(0.97);
    feetStay(after, ['r', 'l'], 0.005);
  });

  it('a hand dragged past reach brings the body along, feet planted', () => {
    // 40 cm on from where the hand is: some 20 cm past what the straight arm reaches.
    const target = at(before, `wrist_${w}`).addScaledVector(forward, 0.4);
    expect(along(target.clone().sub(armEnd()))).toBeGreaterThan(0.15);
    const after = drag(`hand_${w}`, target);
    expect(at(after, `wrist_${w}`).distanceTo(target)).toBeLessThan(0.015);
    feetStay(after);
    expect(along(at(after, 'pelvis').sub(at(before, 'pelvis')))).toBeGreaterThan(0.1);
    expect(at(after, 'pelvis').y).toBeLessThan(at(before, 'pelvis').y + 1e-6);
  });

  it('without planted feet, the whole fencer slides', () => {
    const target = armEnd().addScaledVector(forward, 0.4);
    const after = drag(`hand_${w}`, target, NONE);
    expect(at(after, `wrist_${w}`).distanceTo(target)).toBeLessThan(0.015);
    expect(along(at(after, `ankle_${back}`).sub(at(before, `ankle_${back}`)))).toBeGreaterThan(0.3);
    expect(at(after, 'pelvis').y).toBeCloseTo(at(before, 'pelvis').y, 3);
  });

  it('pulling the front foot forward makes a lunge', () => {
    const target = at(before, `ankle_${front}`).addScaledVector(forward, 0.5);
    const after = drag(`foot_${front}`, target);
    expect(at(after, `ankle_${front}`).distanceTo(target)).toBeLessThan(0.02);
    feetStay(after, [back]);
    expect(along(at(after, 'pelvis').sub(at(before, 'pelvis')))).toBeGreaterThan(0.05);
    expect(at(after, 'pelvis').y).toBeLessThanOrEqual(at(before, 'pelvis').y + 1e-6);
  });

  it('lowering the hips keeps the point, or the hand', () => {
    const target = at(before, 'pelvis').add(new Vector3(0, -0.1, 0));
    const kept = drag('hips', target, { feet: true, hand: false, point: true });
    expect(kept.tip.distanceTo(before.tip)).toBeLessThan(0.015);
    expect(at(kept, 'pelvis').distanceTo(target)).toBeLessThan(0.01);
    feetStay(kept);
    const hand = drag('hips', target, { feet: true, hand: true, point: false });
    expect(at(hand, `wrist_${w}`).distanceTo(at(before, `wrist_${w}`))).toBeLessThan(0.01);
    const both = drag('hips', target, { feet: true, hand: true, point: true });
    expect(at(both, `wrist_${w}`).distanceTo(at(before, `wrist_${w}`))).toBeLessThan(0.01);
    expect(both.tip.distanceTo(before.tip)).toBeLessThan(0.015);
  });

  it('hips without planted feet move the whole body', () => {
    const target = at(before, 'pelvis').addScaledVector(forward, 0.2);
    const after = drag('hips', target, NONE);
    expect(along(at(after, `ankle_${back}`).sub(at(before, `ankle_${back}`)))).toBeCloseTo(0.2, 3);
  });

  it('the point turns the wrist sideways and extends the arm lengthways', () => {
    const wrist0 = at(before, `wrist_${w}`);
    const sideways = before.tip.clone().addScaledVector(outside, 0.15);
    let after = drag('point', sideways);
    expect(at(after, `wrist_${w}`).distanceTo(wrist0)).toBeLessThan(0.03);
    expect(after.tip.distanceTo(sideways)).toBeLessThan(0.02);

    const blade = before.tip.clone().sub(before.guard).normalize();
    const further = before.tip.clone().addScaledVector(blade, 0.2);
    after = drag('point', further);
    expect(after.tip.distanceTo(further)).toBeLessThan(0.02);
    expect(at(after, `elbow_${w}`).distanceTo(at(before, `elbow_${w}`))).toBeGreaterThan(0.02);

    after = drag('point', further, { feet: true, hand: true, point: false });
    expect(at(after, `wrist_${w}`).distanceTo(wrist0)).toBeLessThan(1e-3);
  });

  it('the point far beyond the arm brings the body along', () => {
    const blade = before.tip.clone().sub(before.guard).normalize();
    const far = before.tip.clone().addScaledVector(blade.setY(0).normalize(), 0.5);
    const after = drag('point', far);
    expect(after.tip.distanceTo(far)).toBeLessThan(0.02);
    feetStay(after);
  });

  it('elbow and knee turn about their limb, ends staying', () => {
    const elbowTarget = at(before, `elbow_${w}`).addScaledVector(outside, 0.1).add(new Vector3(0, 0.1, 0));
    let after = drag(`elbow_${w}`, elbowTarget);
    expect(at(after, `wrist_${w}`).distanceTo(at(before, `wrist_${w}`))).toBeLessThan(0.01);
    expect(at(after, `elbow_${w}`).distanceTo(elbowTarget)).toBeLessThan(at(before, `elbow_${w}`).distanceTo(elbowTarget) - 0.02);

    const kneeTarget = at(before, `knee_${front}`).addScaledVector(outside, 0.1);
    after = drag(`knee_${front}`, kneeTarget);
    feetStay(after, ['r', 'l'], 0.01);
    expect(at(after, `knee_${front}`).distanceTo(kneeTarget)).toBeLessThan(at(before, `knee_${front}`).distanceTo(kneeTarget) - 0.02);
  });

  it('the chest bends the spine; the head turns the neck', () => {
    const neck0 = at(before, 'neck');
    const target = neck0.clone().addScaledVector(forward, 0.1);
    let after = drag('chest', target);
    expect(at(after, 'neck').distanceTo(target)).toBeLessThan(0.03);
    feetStay(after, ['r', 'l'], 0.005);
    expect(at(after, 'pelvis').distanceTo(at(before, 'pelvis'))).toBeLessThan(0.005);

    const kept = drag('chest', target, { feet: true, hand: true, point: true });
    expect(at(kept, `wrist_${w}`).distanceTo(at(before, `wrist_${w}`))).toBeLessThan(0.01);
    expect(kept.tip.distanceTo(before.tip)).toBeLessThan(0.02);

    const head0 = headCentre(before);
    const headTarget = head0.clone().add(new Vector3(0, -0.1, 0)).addScaledVector(forward, 0.05);
    after = drag('head', headTarget);
    expect(headCentre(after).distanceTo(headTarget)).toBeLessThan(head0.distanceTo(headTarget) - 0.03);
  });

  it('wild targets give sensible poses', () => {
    const P = dotPositions(before);
    for (const dot of DOTS) {
      for (const target of [
        P[dot].clone().addScaledVector(forward, 10),
        P[dot].clone().add(new Vector3(0, -3, 0)),
        P[dot].clone().add(new Vector3(0, 10, 4)),
        P[dot].clone(),
      ])
        for (const keep of [FEET, NONE, { feet: true, hand: true, point: true }]) {
          const after = drag(dot, target, keep);
          for (const v of Object.values(dotPositions(after))) expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
          if (keep.feet && dot !== 'foot_r' && dot !== 'foot_l' && dot !== 'hips' && dot !== 'knee_r' && dot !== 'knee_l') feetStay(after, ['r', 'l'], 0.02);
        }
    }
    // Exactly on the limb's root.
    for (const [dot, j] of [
      [`hand_${w}`, `shoulder_${w}`],
      [`foot_${front}`, `hip_${front}`],
      ['point', `wrist_${w}`],
    ] as [Dot, JointName][])
      drag(dot, at(before, j));
  });

  it('moves smoothly through and past the reach', () => {
    const sweep = (dot: Dot, from: Vector3, dir: Vector3, keep: Keep, steps = 80) => {
      let last: Record<Dot, Vector3> | null = null;
      for (let i = 0; i <= steps; i++) {
        const now = dotPositions(drag(dot, from.clone().addScaledVector(dir, i * 0.01), keep));
        if (last) for (const d of DOTS) expect(now[d].distanceTo(last[d]), `${dot} step ${i}: ${d}`).toBeLessThan(0.05);
        last = now;
      }
    };
    const up = new Vector3(0, 0.15, 0);
    for (const keep of [FEET, NONE, { feet: true, hand: false, point: true }]) {
      sweep(`hand_${w}`, armEnd().addScaledVector(forward, -0.4), forward, keep);
      sweep(`hand_${back}`, at(before, `wrist_${back}`), up.clone().normalize(), keep);
      // Holding the point while the body lunges far under it folds the arm
      // up against its limits, where it can still jump: sweep that less far.
      sweep(`foot_${front}`, at(before, `ankle_${front}`), forward, keep, keep.point ? 50 : 80);
      sweep(`foot_${back}`, at(before, `ankle_${back}`), forward.clone().negate(), keep);
      sweep('point', before.tip.clone(), forward, keep);
    }
  });

  it('is quick enough to run on every pointer move', () => {
    const target = armEnd().addScaledVector(forward, 0.3);
    const ptarget = before.tip.clone().addScaledVector(forward, 0.4);
    for (let i = 0; i < 5; i++) dragDot(pose, setup, heading, 'point', ptarget, FEET);
    const t0 = performance.now();
    const n = 20;
    for (let i = 0; i < n; i++) {
      dragDot(pose, setup, heading, `hand_${w}`, target, { feet: true, hand: false, point: true });
      dragDot(pose, setup, heading, 'point', ptarget, FEET);
      dragDot(pose, setup, heading, 'chest', at(before, 'neck').addScaledVector(forward, 0.1), { feet: true, hand: true, point: true });
    }
    // Generous, so a busy machine does not fail it; typically about a millisecond each.
    expect((performance.now() - t0) / (3 * n)).toBeLessThan(8);
  });

  describe('keepInPlace', () => {
    const keep = (after: Pose, k: Keep, edited: JointName[]) => {
      const p = keepInPlace(pose, after, setup, heading, k, edited);
      withinLimits(p);
      return p;
    };

    it('turning or leaning the pelvis keeps the feet planted', () => {
      for (const [dof, by] of [
        ['turn', 20],
        ['lean', 20],
        ['side', -8],
      ] as const) {
        const after = setJoint(pose, 'pelvis', dof, (pose.joints.pelvis?.[dof] ?? 0) + by);
        const r = build(keep(after, FEET, ['pelvis']));
        feetStay(r);
      }
    });

    it('a pelvis turn with the hand and point kept', () => {
      const after = setJoint(pose, 'pelvis', 'turn', (pose.joints.pelvis?.turn ?? 0) + 15);
      const r = build(keep(after, { feet: true, hand: true, point: true }, ['pelvis']));
      feetStay(r);
      expect(at(r, `wrist_${w}`).distanceTo(at(before, `wrist_${w}`))).toBeLessThan(0.01);
      expect(r.tip.distanceTo(before.tip)).toBeLessThan(0.02);
      const pointOnly = build(keep(after, { feet: true, hand: false, point: true }, ['pelvis']));
      expect(pointOnly.tip.distanceTo(before.tip)).toBeLessThan(0.02);
    });

    it('a bent knee stays bent; the other foot stays put', () => {
      for (const s of ['r', 'l'] as const) {
        const after = setJoint(pose, `knee_${s}`, 'flex', (pose.joints[`knee_${s}`]?.flex ?? 0) + 20);
        const p = keep(after, FEET, [`knee_${s}`]);
        for (const j of [`hip_${s}`, `knee_${s}`, `ankle_${s}`] as const) expect(p.joints[j]).toEqual(after.joints[j]);
        feetStay(build(p), [s === 'r' ? 'l' : 'r']);
      }
    });

    it('moving the body over the floor keeps the feet where they can reach', () => {
      const after = { ...pose, root: { ...pose.root, x: pose.root.x + 0.1 * forward.x } };
      const r = build(keep(after, FEET, ['pelvis']));
      feetStay(r);
    });

    it('with nothing kept, or nothing changed, returns the edit as it is', () => {
      const after = setJoint(pose, 'pelvis', 'turn', 10);
      expect(keepInPlace(pose, after, setup, heading, NONE, ['pelvis'])).toBe(after);
      const arm = setJoint(pose, 'elbow_l', 'flex', 50);
      expect(keepInPlace(pose, arm, setup, heading, FEET, ['elbow_l'])).toBe(arm);
    });
  });
});

describe('the point, pulled back from a straight arm', () => {
  it('bends the elbow a way that keeps the blade on its line', () => {
    const joints = BUILT_IN_PRESETS.find((p) => p.id === 'extension')!.pose.joints;
    const extended: Pose = { root: { x: 0, z: 0, lift: 0 }, joints };
    const before = solveRig(DEFAULT_SETUP, extended, 0);
    for (const back of [0.1, 0.2, 0.3]) {
      const target = before.tip.clone().add(new Vector3(-back, 0, 0));
      const after = solveRig(DEFAULT_SETUP, dragDot(extended, DEFAULT_SETUP, 0, 'point', target, FEET), 0);
      expect(after.tip.distanceTo(target)).toBeLessThan(0.02);
      // The blade still points the way it did.
      const dir = (r: typeof before) => r.tip.clone().sub(r.guard).normalize();
      expect(dir(after).dot(dir(before))).toBeGreaterThan(0.97);
    }
  });
});
