import { describe, expect, it } from 'vitest';
import { enGardeAt, FORWARD, HEADING, newCombination, type Combination, type FencerId, type TargetArea } from '../model/combination.ts';
import { clampDof, JOINT_NAMES, type JointName } from '../model/joints.ts';
import type { Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { poseFromPreset } from '../presets/library.ts';
import { targetPoint } from '../ik/blades.ts';
import { jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';
import { frontToe } from '../scene/measure.ts';
import { applyAction, type HitWith } from './actions.ts';

// The rules a hit must keep, swept over distance, target, footwork, starting
// stance, both fencers and a left-hander. Hits were patched case by case
// through three review rounds; this is the net under them. A failure prints
// every case that broke a rule, not only the first.

type Poses = Record<FencerId, Pose>;
const other = (f: FencerId): FencerId => (f === 'A' ? 'B' : 'A');
const EN_GARDE = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')!;

function combo(leftA: boolean): Combination {
  const c = newCombination();
  if (leftA) c.fencers = { ...c.fencers, A: { ...c.fencers.A, handedness: 'left' } };
  return c;
}
const rig = (c: Combination, p: Poses, f: FencerId): Rig => solveRig(c.fencers[f], p[f], HEADING[f]);
const side = (c: Combination, f: FencerId) => (c.fencers[f].handedness === 'right' ? 'r' : 'l');
const toe = (c: Combination, p: Poses, f: FencerId) => frontToe(rig(c, p, f), f).x * FORWARD[f];
/** How far `f`'s front toe is short of the opponent's (negative: past it). */
const room = (c: Combination, p: Poses, f: FencerId) => -toe(c, p, other(f)) - toe(c, p, f);

/** Both en garde, each in their own hand, with their front toes `gap` metres apart. */
function toesApart(c: Combination, gap: number): Poses {
  const guard = (f: FencerId, x: number): Pose => ({ ...poseFromPreset(EN_GARDE, c.fencers[f].handedness, enGardeAt(0)), root: { x: -x * FORWARD[f], z: 0, lift: 0 } });
  const at = (x: number): Poses => ({ A: guard('A', x), B: guard('B', x) });
  const wide = at(1);
  return at(1 - (room(c, wide, 'A') - gap) / 2);
}

const VARIANTS: [string, Combination, FencerId][] = [
  ['A right-handed', combo(false), 'A'],
  ['A left-handed', combo(true), 'A'],
  ['B right-handed', combo(false), 'B'],
  ['B against a left-handed A', combo(true), 'B'],
];
const GAPS = [0.15, 0.35, 0.55, 0.8, 1.1, 1.5, 2.2];
const STANCES = ['en garde', 'half-lunge', 'lunge'] as const;
const AREAS: TargetArea[] = ['mask', 'body', 'arm', 'foot'];
const WITH: HitWith[] = ['arm', 'lunge', 'fleche'];

describe('hits keep their rules everywhere', () => {
  it.each(VARIANTS)('%s', (_, c, f) => {
    const broken: string[] = [];
    const o = other(f);
    const w = side(c, f);
    const rear = w === 'r' ? 'l' : 'r';
    let cases = 0;
    for (const gap of GAPS) {
      for (const stance of STANCES) {
        let p = toesApart(c, gap);
        if (stance !== 'en garde') p = applyAction(c, p, f, { kind: 'footwork', move: stance }).poses;
        const before = rig(c, p, f);
        const roomBefore = room(c, p, f);
        for (const area of AREAS) {
          const arm = applyAction(c, p, f, { kind: 'hit', area, with: 'arm' });
          for (const how of WITH) {
            cases++;
            const r = how === 'arm' ? arm : applyAction(c, p, f, { kind: 'hit', area, with: how });
            const after = rig(c, r.poses, f);
            const name = `toes ${gap} m, from ${stance}, ${area} with ${how}`;
            const fail = (what: string) => broken.push(`${name}: ${what}`);
            const moved = (j: JointName) => jointPosition(after, j).distanceTo(jointPosition(before, j));
            const short = r.short ?? 0;

            // A valid pose.
            for (const j of JOINT_NAMES)
              for (const [dof, v] of Object.entries(r.poses[f].joints[j] ?? {}))
                if (!Number.isFinite(v) || Math.abs(clampDof(j, dof, v!) - v!) > 1e-6) fail(`${j}.${dof} = ${v}`);
            // Rule 12: a hit never moves the feet it stands on.
            if (how === 'arm' && Math.max(moved('ankle_r'), moved('ankle_l')) > 0.015) fail(`feet moved ${(Math.max(moved('ankle_r'), moved('ankle_l')) * 100).toFixed(1)} cm`);
            if (how === 'lunge' && moved(`ankle_${rear}`) > 0.015) fail(`back foot moved ${(moved(`ankle_${rear}`) * 100).toFixed(1)} cm`);
            // Rule 12: and never moves the fencer backward.
            const back = (p[f].root.x - r.poses[f].root.x) * FORWARD[f];
            if (back > 0.002) fail(`hips moved back ${(back * 100).toFixed(1)} cm`);
            if (how !== 'fleche' && toe(c, r.poses, f) < toe(c, p, f) - 0.015) fail(`front toe moved back ${((toe(c, p, f) - toe(c, r.poses, f)) * 100).toFixed(1)} cm`);
            // Rule 6: never ends past the opponent's toe (or, from an overlap, further past).
            const roomAfter = room(c, r.poses, f);
            if (roomAfter < Math.min(0, roomBefore) - 1e-6) fail(`front toe ${(-roomAfter * 100).toFixed(1)} cm past the opponent's`);
            // The opponent's body never moves: at most their blade is pushed aside.
            const theirArm = [`shoulder_${side(c, o)}`, `elbow_${side(c, o)}`, `wrist_${side(c, o)}`, 'grip'];
            for (const j of JOINT_NAMES)
              if (!theirArm.includes(j) && JSON.stringify(r.poses[o].joints[j]) !== JSON.stringify(p[o].joints[j])) fail(`opponent's ${j} changed`);
            if (r.poses[o].root !== p[o].root) fail('opponent moved');
            // What the arm alone can land, footwork never loses.
            if (how !== 'arm' && arm.short === 0 && short !== 0) fail(`falls ${(short * 100).toFixed(0)} cm short though the arm alone lands`);
            // A miss never leaves the fencer sent forward with the point past the target.
            const target = targetPoint(rig(c, r.poses, o), area, side(c, o), after.tip);
            const past = (after.tip.x - target.x) * FORWARD[f];
            if (short > 0 && back < -0.02 && past > 0.05) fail(`went forward ${(-back * 100).toFixed(0)} cm and left the point ${(past * 100).toFixed(0)} cm past the target`);
            // And says truthfully which way it missed.
            if (short > 0 && past > 0.05 && !r.close) fail(`point ${(past * 100).toFixed(0)} cm past the target, reported as too far`);
            // The arm lands whatever a straight or folded arm can reach: a target at least a blade's length from the shoulder, and inside the arm's stretch.
            if (how === 'arm' && stance === 'en garde') {
              const shoulder = jointPosition(before, `shoulder_${w}`);
              const blade = before.tip.distanceTo(jointPosition(before, `wrist_${w}`));
              const far = targetPoint(rig(c, p, o), area, side(c, o), before.tip).distanceTo(shoulder);
              const stretch = before.layout.upperArm + before.layout.forearm;
              if (far > blade + 0.05 && far < blade + stretch - 0.08 && short !== 0) fail(`in reach (${far.toFixed(2)} m from the shoulder) and missed by ${(short * 100).toFixed(0)} cm`);
            }
          }
        }
      }
    }
    expect(cases).toBe(GAPS.length * STANCES.length * AREAS.length * WITH.length);
    expect(broken, `${broken.length} of ${cases} hits broke a rule`).toEqual([]);
  }, 120_000);
});
