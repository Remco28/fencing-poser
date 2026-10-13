import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { copyStep, HEADING, newCombination, type Combination, type FencerId } from '../model/combination.ts';
import { curvePose } from '../model/tween.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { solveRig } from '../rig/kinematics.ts';
import { frameAt } from '../viewer/player.ts';
import { bendFor, pathMiddle } from './path.ts';

const P = (id: string) => BUILT_IN_PRESETS.find((p) => p.id === id)!.pose;

function twoSteps(from: string, to: string): Combination {
  const c = newCombination();
  c.steps[0].poses = { A: { ...P(from), root: { x: -1.3, z: 0, lift: 0 } }, B: { ...P('en-garde'), root: { x: 1.3, z: 0, lift: 0 } } };
  const next = copyStep(c.steps[0]);
  next.poses.A = { ...P(to), root: { x: -1.2, z: 0, lift: 0 } };
  c.steps.push(next);
  return c;
}

const tips = (c: Combination, f: FencerId, n = 60) =>
  Array.from({ length: n + 1 }, (_, i) => solveRig(c.fencers[f], frameAt(c, i / n).poses[f], HEADING[f]).tip);

/**
 * How spiky the point's movement is: the largest ratio between one frame's
 * travel and the larger of its neighbours'. Gliding (speeding up and slowing
 * down smoothly) stays near 1; a leap stands out several times over.
 */
function spikiness(points: Vector3[]): number {
  const steps = points.slice(1).map((p, i) => p.distanceTo(points[i]));
  let worst = 1;
  for (let i = 1; i < steps.length - 1; i++) worst = Math.max(worst, steps[i] / Math.max(steps[i - 1], steps[i + 1], 0.01));
  return worst;
}

describe('shaping a path', () => {
  it('curves through an old-style halfway pose and still starts and ends on the steps', () => {
    const a = { root: { x: 0, z: 0, lift: 0 }, joints: { elbow_r: { flex: 0 } } };
    const via = { root: { x: 0.5, z: 0, lift: 0 }, joints: { elbow_r: { flex: 100 } } };
    const b = { root: { x: 1, z: 0, lift: 0 }, joints: { elbow_r: { flex: 20 } } };
    expect(curvePose(a, via, b, 0.5).joints.elbow_r?.flex).toBeCloseTo(100);
    expect(curvePose(a, via, b, 1).joints.elbow_r?.flex).toBeCloseTo(20);
  });

  it('sends the point through where the middle of its path is dragged, keeping both steps', () => {
    const c = twoSteps('extension', 'lunge');
    const lower = pathMiddle(c, 1, 'A', (pos) => frameAt(c, pos)).add(new Vector3(0, -0.25, 0.1));
    const shaped = { ...c, steps: [c.steps[0], { ...c.steps[1], bend: { A: bendFor(c, 1, 'A', lower) } }] };
    const tip = solveRig(c.fencers.A, frameAt(shaped, 0.5).poses.A, HEADING.A).tip;
    expect(tip.distanceTo(lower)).toBeLessThan(0.03);
    expect(frameAt(shaped, 0).poses.A).toEqual(c.steps[0].poses.A);
    expect(frameAt(shaped, 1).poses.A).toEqual(c.steps[1].poses.A);
  });

  // Blending joint angles through a halfway pose, or solving the arm afresh
  // every frame, made the point leap about mid-movement. A bent path must
  // glide: no frame may travel more than 1.5 times its neighbours.
  it.each([
    ['extension', 'lunge'],
    ['en-garde', 'parry-4'],
    ['parry-6', 'parry-4'],
  ])('never zig-zags: %s to %s, dragged every which way', (from, to) => {
    const c = twoSteps(from, to);
    for (const f of ['A', 'B'] as FencerId[]) {
      const mid = pathMiddle(c, 1, f, (pos) => frameAt(c, pos));
      for (const off of [
        [-0.3, -0.4, -0.3],
        [-0.3, -0.2, 0.3],
        [0, 0.4, 0],
        [0.3, -0.2, 0],
        [0, -0.3, 0.2],
      ] as [number, number, number][]) {
        const bend = bendFor(c, 1, f, mid.clone().add(new Vector3(...off)));
        const shaped = { ...c, steps: [c.steps[0], { ...c.steps[1], bend: { [f]: bend } }] };
        expect(spikiness(tips(shaped, f)), `${f} dragged ${off}`).toBeLessThan(1.5);
      }
    }
  });
});
