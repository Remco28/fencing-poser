import { Line3, Matrix4, Vector3 } from 'three';
import { HEADING, type Combination, type FencerId, type Step, type StepCamera } from '../model/combination.ts';
import { jointAxis, jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';

export function rigsFor(c: Combination, step: Step): Record<FencerId, Rig> {
  return {
    A: solveRig(c.fencers.A, step.poses.A, HEADING.A),
    B: solveRig(c.fencers.B, step.poses.B, HEADING.B),
  };
}

const other = (f: FencerId): FencerId => (f === 'A' ? 'B' : 'A');

/** The toe of whichever foot is further forward, toward the opponent. */
export function frontToe(rig: Rig, fencer: FencerId): Vector3 {
  const forward = HEADING[fencer] === 0 ? 1 : -1;
  const toes = (['ankle_r', 'ankle_l'] as const).map((a) =>
    jointPosition(rig, a).addScaledVector(jointAxis(rig, a, [1, 0, 0]), rig.layout.toe).setY(0.01),
  );
  return toes.reduce((best, t) => (t.x * forward > best.x * forward ? t : best));
}

/** The body as capsules (segment + radius), close enough to measure reach against. */
function capsules(rig: Rig): { line: Line3; radius: number }[] {
  const H = rig.layout.height;
  const b = rig.layout.build;
  const p = (j: Parameters<typeof jointPosition>[1]) => jointPosition(rig, j);
  const along = (j: Parameters<typeof jointPosition>[1], local: [number, number, number]) =>
    new Vector3(...local).applyMatrix4(rig.world[j] as Matrix4);
  const head = along('neck', [0.008 * H, 0.088 * H, 0]);
  const list: [Vector3, Vector3, number][] = [
    [p('pelvis'), p('abdomen'), 0.09 * H * b],
    [p('abdomen'), p('chest'), 0.075 * H * b],
    [p('chest'), along('chest', [0, 0.11 * H, 0]), 0.1 * H * b],
    [head, head, 0.065 * H],
  ];
  for (const s of ['r', 'l'] as const) {
    list.push(
      [p(`shoulder_${s}`), p(`elbow_${s}`), 0.03 * H * b],
      [p(`elbow_${s}`), p(`wrist_${s}`), 0.026 * H * b],
      [p(`wrist_${s}`), along(`wrist_${s}`, [0, -rig.layout.fist, 0]), 0.03 * H],
      [p(`hip_${s}`), p(`knee_${s}`), 0.047 * H * b],
      [p(`knee_${s}`), p(`ankle_${s}`), 0.034 * H * b],
      [p(`ankle_${s}`), along(`ankle_${s}`, [rig.layout.toe, -rig.layout.ankleHeight / 2, 0]), 0.03 * H],
    );
  }
  return list.map(([a, c, radius]) => ({ line: new Line3(a, c), radius }));
}

export interface Reach {
  /** Metres from the point to the opponent's body surface; 0 means touching. */
  distance: number;
  from: Vector3;
  to: Vector3;
}

/** How far a fencer's point is from the nearest part of the opponent. */
export function pointReach(attacker: Rig, defender: Rig): Reach {
  let best: Reach = { distance: Infinity, from: attacker.tip, to: attacker.tip };
  for (const { line, radius } of capsules(defender)) {
    const closest = line.closestPointToPoint(attacker.tip, true, new Vector3());
    const gap = closest.distanceTo(attacker.tip) - radius;
    if (gap < best.distance) {
      const surface = attacker.tip.clone().sub(closest).setLength(radius).add(closest);
      best = { distance: Math.max(0, gap), from: attacker.tip.clone(), to: gap > 0 ? surface : attacker.tip.clone() };
    }
  }
  return best;
}

export interface Measurements {
  /** Between the front feet, along the piste. */
  feet: { distance: number; from: Vector3; to: Vector3 };
  reach: Record<FencerId, Reach>;
}

export function measure(c: Combination, step: Step): Measurements {
  const rigs = rigsFor(c, step);
  const a = frontToe(rigs.A, 'A');
  const b = frontToe(rigs.B, 'B');
  return {
    feet: { distance: Math.abs(b.x - a.x), from: a, to: new Vector3(b.x, 0.01, a.z) },
    reach: {
      A: pointReach(rigs.A, rigs[other('A')]),
      B: pointReach(rigs.B, rigs[other('B')]),
    },
  };
}

export type ViewName = 'side' | 'overhead' | 'behindA' | 'behindB';

export const VIEW_NAMES: Record<ViewName, string> = {
  side: 'Side',
  overhead: 'Overhead',
  behindA: 'Behind A',
  behindB: 'Behind B',
};

/** One-click views, framed around wherever the two fencers stand. */
export function viewFor(name: ViewName, step: Step): StepCamera {
  const xA = step.poses.A.root.x;
  const xB = step.poses.B.root.x;
  const mid = (xA + xB) / 2;
  const span = Math.abs(xB - xA) + 1.6;
  switch (name) {
    case 'side':
      return { position: [mid, 1.3, Math.max(3.2, span * 1.15 + 0.8)], target: [mid, 0.95, 0] };
    case 'overhead':
      return { position: [mid, Math.max(4.5, span * 1.3 + 1.5), 0.01], target: [mid, 0, 0] };
    // Over the shoulder, high and wide enough to clear a ghost of the step before.
    case 'behindA':
      return { position: [xA - 2.3, 2.05, 1.15], target: [xA + 1.6, 0.95, -0.1] };
    case 'behindB':
      return { position: [xB + 2.3, 2.05, -1.15], target: [xB - 1.6, 0.95, 0.1] };
  }
}

