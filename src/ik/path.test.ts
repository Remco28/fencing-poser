import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { copyStep, HEADING, newCombination, type Combination, type FencerId } from '../model/combination.ts';
import { curvePose } from '../model/tween.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { solveRig } from '../rig/kinematics.ts';
import { frameAt, throughKnots } from '../viewer/player.ts';
import { pathPoint, pinFor } from './path.ts';

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
    const lower = pathPoint(c, 1, 'A', 0.5, (pos) => frameAt(c, pos)).add(new Vector3(0, -0.25, 0.1));
    const shaped = { ...c, steps: [c.steps[0], { ...c.steps[1], pins: { A: [pinFor(c, 1, 'A', lower)] } }] };
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
      const mid = pathPoint(c, 1, f, 0.5, (pos) => frameAt(c, pos));
      for (const off of [
        [-0.3, -0.4, -0.3],
        [-0.3, -0.2, 0.3],
        [0, 0.4, 0],
        [0.3, -0.2, 0],
        [0, -0.3, 0.2],
      ] as [number, number, number][]) {
        const pin = pinFor(c, 1, f, mid.clone().add(new Vector3(...off)));
        const shaped = { ...c, steps: [c.steps[0], { ...c.steps[1], pins: { [f]: [pin] } }] };
        expect(spikiness(tips(shaped, f)), `${f} dragged ${off}`).toBeLessThan(1.5);
      }
    }
  });

  it('one pin halfway eases in and out like a parabola', () => {
    for (const k of [0.1, 0.25, 0.5, 0.8]) expect(throughKnots([[0.5, 10]], k)).toBeCloseTo(40 * k * (1 - k));
  });

  it('reads an older single bend as a pin halfway', () => {
    const c = twoSteps('extension', 'lunge');
    const lower = pathPoint(c, 1, 'A', 0.5, (pos) => frameAt(c, pos)).add(new Vector3(0, -0.2, 0));
    const pin = pinFor(c, 1, 'A', lower);
    const old = { ...c, steps: [c.steps[0], { ...c.steps[1], bend: { A: pin.joints } }] };
    const now = { ...c, steps: [c.steps[0], { ...c.steps[1], pins: { A: [pin] } }] };
    expect(frameAt(old, 0.37).poses.A).toEqual(frameAt(now, 0.37).poses.A);
  });

  // Not everything moves in one arc: a feint that drops late, or an S round
  // two blades. Several pins send the point through each, still gliding.
  it.each([
    ['extension', 'lunge'],
    ['en-garde', 'parry-4'],
  ])('passes through two or three pins and still glides: %s to %s', (from, to) => {
    const c = twoSteps(from, to);
    const at = (t: number) => pathPoint(c, 1, 'A', t, (pos) => frameAt(c, pos));
    for (const offsets of [
      [[0.25, [0, -0.2, 0]], [0.75, [0, 0.15, 0.1]]],
      [[0.2, [0, 0, 0.15]], [0.5, [0, -0.2, 0]], [0.8, [0, 0, -0.15]]],
      [[0.3, [0, 0, 0]], [0.6, [0, -0.2, 0]]],
    ] as [number, [number, number, number]][][]) {
      const targets = offsets.map(([t, off]) => ({ t, target: at(t).add(new Vector3(...off)) }));
      const pins = targets.map(({ t, target }) => pinFor(c, 1, 'A', target, t));
      const shaped = { ...c, steps: [c.steps[0], { ...c.steps[1], pins: { A: pins } }] };
      for (const { t, target } of targets) {
        const tip = solveRig(c.fencers.A, frameAt(shaped, t).poses.A, HEADING.A).tip;
        expect(tip.distanceTo(target), `pin at ${t}`).toBeLessThan(0.03);
      }
      expect(spikiness(tips(shaped, 'A', 90)), JSON.stringify(offsets)).toBeLessThan(1.6);
    }
  });
});
