import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { moveHips } from '../ik/ik.ts';
import { copyStep, HEADING, newCombination, type Combination, type FencerId } from '../model/combination.ts';
import type { Pose } from '../model/types.ts';
import { jointPosition, solveRig } from '../rig/kinematics.ts';
import { frameAt } from './player.ts';

// Footwork between steps, measured the way it is drawn (the fencer dropped onto the floor).

function twoSteps(change: (c: Combination, pose: Pose) => Pose, f: FencerId = 'A'): Combination {
  const c = newCombination();
  const next = copyStep(c.steps[0]);
  next.poses[f] = change(c, next.poses[f]);
  return { ...c, steps: [c.steps[0], next] };
}
const ankles = (c: Combination, pose: Pose, f: FencerId) => {
  const rig = solveRig(c.fencers[f], pose, HEADING[f]);
  return { r: jointPosition(rig, 'ankle_r'), l: jointPosition(rig, 'ankle_l'), pelvis: jointPosition(rig, 'pelvis') };
};
const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const TIMES = Array.from({ length: 39 }, (_, i) => (i + 1) / 40);

describe.each(['A', 'B'] as FencerId[])('footwork between steps, fencer %s', (f) => {
  const fwd = f === 'A' ? 1 : -1;

  it.each([
    ['advance', 0.35],
    ['retreat', -0.35],
  ])('an %s goes one foot at a time, the leading foot first', (_, metres) => {
    const c = twoSteps((_c, p) => ({ ...p, root: { ...p.root, x: p.root.x + metres * fwd } }), f);
    const from = ankles(c, c.steps[0].poses[f], f);
    const to = ankles(c, c.steps[1].poses[f], f);
    const front = from.r.x * fwd > from.l.x * fwd ? 'r' : 'l';
    const rear = front === 'r' ? 'l' : 'r';
    const lead = metres > 0 ? front : rear;
    const trail = lead === 'r' ? 'l' : 'r';
    let lifted = 0;
    for (const t of TIMES) {
      const now = ankles(c, frameAt(c, t).poses[f], f);
      // Always one foot standing where it began or where it will end.
      const standing = (['r', 'l'] as const).some((s) => Math.min(flat(now[s], from[s]), flat(now[s], to[s])) < 0.006);
      expect(standing, `a foot is down at ${t}`).toBe(true);
      // The trailing foot does not leave before the leading one has landed.
      if (flat(now[lead], to[lead]) > 0.01) expect(flat(now[trail], from[trail]), `trailing foot waits at ${t}`).toBeLessThan(0.006);
      // No foot goes through the floor, and the hips only ever travel one way.
      for (const s of ['r', 'l'] as const) expect(now[s].y).toBeGreaterThan(from[s].y - 0.01);
      lifted = Math.max(lifted, now.r.y - from.r.y, now.l.y - from.l.y);
      expect((now.pelvis.x - from.pelvis.x) * fwd * Math.sign(metres)).toBeGreaterThan(-1e-6);
    }
    expect(lifted).toBeGreaterThan(0.02);
    expect(lifted).toBeLessThan(0.08);
  });

  it('feet that end where they began stay planted while the hips move', () => {
    const c = twoSteps((cc, p) => {
      const rig = solveRig(cc.fencers[f], p, HEADING[f]);
      const hips = jointPosition(rig, 'pelvis');
      return moveHips(p, cc.fencers[f], HEADING[f], hips.clone().add(new Vector3(0.18 * fwd, -0.08, 0)));
    }, f);
    const from = ankles(c, c.steps[0].poses[f], f);
    for (const t of TIMES) {
      const now = ankles(c, frameAt(c, t).poses[f], f);
      for (const s of ['r', 'l'] as const) expect(now[s].distanceTo(from[s]), `${s} foot at ${t}`).toBeLessThan(0.008);
    }
  });

  it('arrives exactly: the frame just before a step is that step’s pose, to within a few millimetres', () => {
    const c = twoSteps((_c, p) => ({ ...p, root: { ...p.root, x: p.root.x + 0.35 * fwd } }), f);
    const to = ankles(c, c.steps[1].poses[f], f);
    const now = ankles(c, frameAt(c, 0.999).poses[f], f);
    for (const k of ['r', 'l', 'pelvis'] as const) expect(now[k].distanceTo(to[k])).toBeLessThan(0.004);
    const last = frameAt(c, 0.999).poses[f];
    for (const j of ['knee_r', 'knee_l', 'hip_r', 'hip_l'] as const)
      for (const [dof, v] of Object.entries(c.steps[1].poses[f].joints[j] ?? {})) expect(Math.abs((last.joints[j]?.[dof] ?? 0) - v!), `${j}.${dof}`).toBeLessThan(2);
  });

  it('leaves a move of the arm alone', () => {
    const c = twoSteps((_c, p) => ({ ...p, joints: { ...p.joints, elbow_r: { flex: 10 } } }), f);
    const mid = frameAt(c, 0.5).poses[f];
    expect(mid.joints.knee_r).toEqual(c.steps[0].poses[f].joints.knee_r);
    expect(mid.joints.hip_l).toEqual(c.steps[0].poses[f].joints.hip_l);
  });
});
