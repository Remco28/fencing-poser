import { Line3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { copyStep, enGardeAt, FORWARD, HEADING, newCombination, START_X, type Combination, type FencerId } from '../model/combination.ts';
import { clampDof, JOINT_NAMES, type JointName } from '../model/joints.ts';
import type { Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { poseFromPreset } from '../presets/library.ts';
import { closestBetween, outsideOf } from '../ik/blades.ts';
import { dragDot } from '../ik/drag.ts';
import { jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';
import { frontToe, pointReach } from '../scene/measure.ts';
import { frameAt } from '../viewer/player.ts';
import { actionLabel, applyAction, shapePath, STEP_LENGTH, type Action } from './actions.ts';

type Poses = Record<FencerId, Pose>;
const other = (f: FencerId): FencerId => (f === 'A' ? 'B' : 'A');

function combo(leftA = false): Combination {
  const c = newCombination();
  if (leftA) {
    c.fencers = { ...c.fencers, A: { ...c.fencers.A, handedness: 'left' } };
    c.steps[0].poses = apart(c, START_X);
  }
  return c;
}
/** Both en garde, `x` either side of centre, each in their own hand. */
function apart(c: Combination, x: number): Poses {
  const guard = (f: FencerId) => ({ ...poseFromPreset(EN_GARDE, c.fencers[f].handedness, enGardeAt(0)), root: { x: -x * FORWARD[f], z: 0, lift: 0 } });
  return { A: guard('A'), B: guard('B') };
}
const EN_GARDE = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')!;
const start = (c: Combination): Poses => c.steps[0].poses;
const rig = (c: Combination, p: Poses, f: FencerId): Rig => solveRig(c.fencers[f], p[f], HEADING[f]);
const side = (c: Combination, f: FencerId) => (c.fencers[f].handedness === 'right' ? 'r' : 'l');
const rear = (c: Combination, f: FencerId) => (side(c, f) === 'r' ? 'l' : 'r');
const rearAnkleX = (c: Combination, p: Poses, f: FencerId) => jointPosition(rig(c, p, f), `ankle_${rear(c, f)}`).x;
const toeAlong = (c: Combination, p: Poses, f: FencerId) => frontToe(rig(c, p, f), f).x * FORWARD[f];
const act = (c: Combination, p: Poses, f: FencerId, a: Action) => applyAction(c, p, f, a);

/** The joints whose angles differ between two poses. */
function changed(a: Pose, b: Pose): JointName[] {
  return JOINT_NAMES.filter((n) => JSON.stringify(a.joints[n] ?? {}) !== JSON.stringify(b.joints[n] ?? {}));
}
const weaponArm = (c: Combination, f: FencerId): JointName[] => {
  const s = side(c, f);
  return [`shoulder_${s}`, `elbow_${s}`, `wrist_${s}`, 'grip'];
};

const variants: [string, Combination, FencerId][] = [
  ['A right-handed', combo(), 'A'],
  ['A left-handed', combo(true), 'A'],
  ['B right-handed', combo(), 'B'],
  ['B against a left-handed A', combo(true), 'B'],
];

describe('footwork', () => {
  it.each(variants)('lunges and half-lunges with the back foot planted (%s)', (_, c, f) => {
    const p = start(c);
    const lunge = act(c, p, f, { kind: 'footwork', move: 'lunge' }).poses;
    const half = act(c, p, f, { kind: 'footwork', move: 'half-lunge' }).poses;
    expect(Math.abs(rearAnkleX(c, lunge, f) - rearAnkleX(c, p, f))).toBeLessThan(0.01);
    expect(Math.abs(rearAnkleX(c, half, f) - rearAnkleX(c, p, f))).toBeLessThan(0.01);
    expect(toeAlong(c, half, f)).toBeGreaterThan(toeAlong(c, p, f) + 0.1);
    expect(toeAlong(c, lunge, f)).toBeGreaterThan(toeAlong(c, half, f) + 0.1);

    const back = act(c, lunge, f, { kind: 'footwork', move: 'recover' }).poses;
    expect(Math.abs(rearAnkleX(c, back, f) - rearAnkleX(c, p, f))).toBeLessThan(0.01);
    for (const n of ['pelvis', 'hip_r', 'knee_r', 'ankle_r', 'hip_l', 'knee_l', 'ankle_l'] as JointName[])
      expect(back[f].joints[n]).toEqual(p[f].joints[n]);
  });

  it.each(variants)('advances toward the opponent and retreats back (%s)', (_, c, f) => {
    const p = start(c);
    const fwd = act(c, p, f, { kind: 'footwork', move: 'advance' }).poses;
    expect((fwd[f].root.x - p[f].root.x) * FORWARD[f]).toBeCloseTo(STEP_LENGTH);
    const back = act(c, fwd, f, { kind: 'footwork', move: 'retreat' }).poses;
    expect(back[f].root.x).toBeCloseTo(p[f].root.x);
  });
});

describe('distance', () => {
  it.each(variants)('stands where each attack just reaches (%s)', (_, c, f) => {
    const p = start(c);
    const medium = act(c, p, f, { kind: 'distance', measure: 'medium' }).poses;
    expect(medium[f].joints).toEqual(p[f].joints);
    expect(act(c, medium, f, { kind: 'hit', area: 'body', with: 'lunge' }).short ?? 0).toBeLessThan(0.02);
    expect(act(c, medium, f, { kind: 'hit', area: 'body', with: 'arm' }).short).toBeGreaterThan(0);

    const short = act(c, p, f, { kind: 'distance', measure: 'short' }).poses;
    expect(act(c, short, f, { kind: 'hit', area: 'body', with: 'arm' }).short ?? 0).toBeLessThan(0.02);
    expect((short[f].root.x - medium[f].root.x) * FORWARD[f]).toBeGreaterThan(0.3);

    const long = act(c, p, f, { kind: 'distance', measure: 'long' }).poses;
    expect((medium[f].root.x - long[f].root.x) * FORWARD[f]).toBeCloseTo(STEP_LENGTH, 2);
  });
});

describe('arm actions', () => {
  it.each(variants)('parries move only the weapon arm, to the right side (%s)', (_, c, f) => {
    const p = apart(c, 1.1);
    const out = (r: Rig) => {
      // The fencer's outside: their weapon-hand side, horizontally.
      const right = HEADING[f] === 0 ? 1 : -1;
      return jointPosition(r, `wrist_${side(c, f)}`).z * right * (side(c, f) === 'r' ? 1 : -1);
    };
    const four = act(c, p, f, { kind: 'parry', number: 4 }).poses;
    const six = act(c, p, f, { kind: 'parry', number: 6 }).poses;
    for (const q of [four, six]) {
      for (const n of changed(p[f], q[f])) expect(weaponArm(c, f)).toContain(n);
    }
    const guard = out(rig(c, p, f));
    expect(out(rig(c, four, f))).toBeLessThan(guard);
    expect(out(rig(c, six, f))).toBeGreaterThan(guard);
    // Prime may turn the body and head too, but not the legs.
    const one = act(c, p, f, { kind: 'parry', number: 1 }).poses;
    for (const n of changed(p[f], one[f])) expect([...weaponArm(c, f), 'abdomen', 'chest', 'neck']).toContain(n);
  });

  it.each(variants)('extends the arm only, the point further forward (%s)', (_, c, f) => {
    const p = start(c);
    const ext = act(c, p, f, { kind: 'extend' }).poses;
    for (const n of changed(p[f], ext[f])) expect(weaponArm(c, f)).toContain(n);
    expect(rig(c, ext, f).tip.x * FORWARD[f]).toBeGreaterThan(rig(c, p, f).tip.x * FORWARD[f] + 0.1);
  });

  /** How far the opponent's blade lies to the mover's outside of the mover's own, where they are nearest. */
  const lies = (c: Combination, p: Poses, f: FencerId) => {
    const mine = rig(c, p, f);
    const theirs = rig(c, p, other(f));
    const g = closestBetween(mine.guard, mine.tip, theirs.guard, theirs.tip);
    return { distance: g.distance, outside: g.c2.clone().sub(g.c1).dot(outsideOf(c, f)) };
  };

  it.each(variants)('engages with the opponent’s blade held on the line’s side (%s)', (_, c, f) => {
    const p = apart(c, 1.1);
    const six = lies(c, act(c, p, f, { kind: 'engage', line: 'sixte' }).poses, f);
    expect(six.distance).toBeLessThan(0.02);
    expect(six.outside).toBeGreaterThan(0);
    const four = lies(c, act(c, p, f, { kind: 'engage', line: 'quarte' }).poses, f);
    expect(four.distance).toBeLessThan(0.02);
    expect(four.outside).toBeLessThan(0);
  });

  it.each(variants)('beats the blade aside, shown at the moment of contact (%s)', (_, c, f) => {
    const p = apart(c, 1.1);
    const o = other(f);
    for (const line of ['sixte', 'quarte'] as const) {
      const beat = act(c, p, f, { kind: 'beat', line }).poses;
      const way = outsideOf(c, f).multiplyScalar(line === 'sixte' ? 1 : -1);
      expect(lies(c, beat, f).distance).toBeLessThan(0.02);
      // The opponent's point has been knocked the way the line carries it.
      expect(rig(c, beat, o).tip.clone().sub(rig(c, p, o).tip).dot(way)).toBeGreaterThan(0.05);
      // The beat is the wrist's work: the hand hardly moves.
      const wrist = `wrist_${side(c, f)}` as const;
      expect(jointPosition(rig(c, beat, f), wrist).distanceTo(jointPosition(rig(c, p, f), wrist))).toBeLessThan(0.05);
    }
  });

  it.each(variants)('cannot beat or engage a blade that is out of reach (%s)', (_, c, f) => {
    const p = start(c);
    for (const kind of ['beat', 'engage'] as const) {
      const r = act(c, p, f, { kind, line: 'quarte' });
      expect(r.apart).toBe(true);
      expect(r.poses).toBe(p);
    }
  });

  it.each(variants)('parries an attack: the point is carried off the target, to the parry’s side (%s)', (_, c, f) => {
    const o = other(f);
    // The opponent stands at lunging distance and hits the body.
    let p = apart(c, 1.1);
    p = act(c, p, o, { kind: 'distance', measure: 'medium' }).poses;
    const attack = act(c, p, o, { kind: 'hit', area: 'body', with: 'lunge' });
    expect(attack.short).toBe(0);
    expect(pointReach(rig(c, attack.poses, o), rig(c, attack.poses, f)).distance).toBeLessThan(0.02);
    for (const [number, outside] of [[6, 1], [4, -1], [3, 1]] as const) {
      const parried = act(c, attack.poses, f, { kind: 'parry', number }).poses;
      const l = lies(c, parried, f);
      expect(l.distance).toBeLessThan(0.02);
      expect(l.outside * outside).toBeGreaterThan(0);
      // No longer on target.
      expect(pointReach(rig(c, parried, o), rig(c, parried, f)).distance).toBeGreaterThan(0.03);
      // The attacker's hand and body stay where the attack left them: only the blade is carried.
      const wrist = `wrist_${side(c, o)}` as const;
      expect(jointPosition(rig(c, parried, o), wrist).distanceTo(jointPosition(rig(c, attack.poses, o), wrist))).toBeLessThan(0.09);
    }
    // A low parry against this high attack either finds the blade or leaves the attacker alone: it never wrenches their arm about.
    for (const number of [2, 7, 8] as const) {
      const parried = act(c, attack.poses, f, { kind: 'parry', number }).poses;
      const wrist = `wrist_${side(c, o)}` as const;
      expect(jointPosition(rig(c, parried, o), wrist).distanceTo(jointPosition(rig(c, attack.poses, o), wrist))).toBeLessThan(0.09);
    }
  });
});

describe('hits', () => {
  it.each(variants)('falls short with the arm from far away, lands with a flèche (%s)', (_, c, f) => {
    const p = start(c);
    expect(act(c, p, f, { kind: 'hit', area: 'body', with: 'arm' }).short).toBeGreaterThan(0);
    const fleche = act(c, p, f, { kind: 'hit', area: 'body', with: 'fleche' });
    expect(fleche.short ?? 0).toBeLessThan(0.02);
  });

  it.each(variants)('hits the arm with the arm in close, and with a lunge from lunging distance (%s)', (_, c, f) => {
    expect(act(c, apart(c, 1.1), f, { kind: 'hit', area: 'arm', with: 'arm' }).short ?? 0).toBe(0);
    const p = act(c, start(c), f, { kind: 'distance', measure: 'medium' }).poses;
    expect(act(c, p, f, { kind: 'hit', area: 'arm', with: 'lunge' }).short ?? 0).toBeLessThan(0.02);
  });
});

const EVERY: Action[] = [
  ...(['advance', 'retreat', 'half-lunge', 'lunge', 'recover', 'fleche'] as const).map((move) => ({ kind: 'footwork', move }) as Action),
  ...(['short', 'medium', 'long'] as const).map((measure) => ({ kind: 'distance', measure }) as Action),
  { kind: 'extend' },
  ...([1, 2, 3, 4, 6, 7, 8] as const).map((number) => ({ kind: 'parry', number }) as Action),
  ...(['sixte', 'quarte'] as const).flatMap((line) => [{ kind: 'beat', line } as Action, { kind: 'engage', line } as Action]),
  ...(['mask', 'body', 'arm', 'hand', 'leg', 'foot'] as const).map((area) => ({ kind: 'hit', area, with: 'arm' }) as Action),
  { kind: 'hit', area: 'body', with: 'lunge' },
  { kind: 'hit', area: 'mask', with: 'fleche' },
];

describe('every action', () => {
  it.each(variants)('keeps joints inside their limits and the fencers apart (%s)', (_, c, f) => {
    for (const p of [apart(c, 1.1), apart(c, 0.7)]) {
      for (const a of EVERY) {
        const { poses, short } = act(c, p, f, a);
        expect(Number.isNaN(short ?? 0)).toBe(false);
        for (const g of ['A', 'B'] as FencerId[]) {
          const pose = poses[g];
          for (const v of Object.values(pose.root)) expect(Number.isFinite(v)).toBe(true);
          for (const [joint, dofs] of Object.entries(pose.joints) as [JointName, Record<string, number>][])
            for (const [dof, v] of Object.entries(dofs)) {
              expect(Number.isFinite(v), `${actionLabel(a)} ${joint}.${dof}`).toBe(true);
              expect(clampDof(joint, dof, v), `${actionLabel(a)} ${joint}.${dof}`).toBeCloseTo(v, 6);
            }
        }
        expect(toeAlong(c, poses, f), actionLabel(a)).toBeLessThanOrEqual(-toeAlong(c, poses, other(f)) + 1e-6);
      }
    }
  });
});

describe('shaping the path round the blade', () => {
  function crossing(): Combination {
    const c = newCombination();
    c.steps[0].poses = apart(c, 1.1);
    c.steps[0].poses = act(c, c.steps[0].poses, 'A', { kind: 'engage', line: 'sixte' }).poses;
    const next = copyStep(c.steps[0]);
    next.poses = { ...next.poses, A: act(c, c.steps[0].poses, 'A', { kind: 'engage', line: 'quarte' }).poses.A };
    c.steps.push(next);
    return c;
  }
  const withPins = (c: Combination, pins: ReturnType<typeof shapePath>): Combination => ({
    ...c,
    steps: [c.steps[0], { ...c.steps[1], pins: { A: pins! } }],
  });
  const midway = (c: Combination) => {
    const p = frameAt(c, 0.5).poses;
    return { a: rig(c, p, 'A'), b: rig(c, p, 'B') };
  };

  it('a disengage passes under the blade', () => {
    const c = crossing();
    const pins = shapePath(c, 1, 'A', 'under');
    expect(pins).toHaveLength(1);
    const { a, b } = midway(withPins(c, pins));
    const nearest = new Line3(b.guard, b.tip).closestPointToPoint(a.tip, true, new Vector3());
    expect(a.tip.y).toBeLessThan(nearest.y - 0.05);
  });

  it('a cut-over passes over the point', () => {
    const c = crossing();
    const { a, b } = midway(withPins(c, shapePath(c, 1, 'A', 'over')));
    expect(a.tip.y).toBeGreaterThan(b.tip.y + 0.05);
  });

  it('ignores the pins it is replacing', () => {
    const c = crossing();
    const under = shapePath(c, 1, 'A', 'under');
    const again = shapePath(withPins(c, shapePath(c, 1, 'A', 'over')), 1, 'A', 'under');
    expect(again).toEqual(under);
  });

  it('a direct movement needs no pins', () => {
    expect(shapePath(crossing(), 1, 'A', 'direct')).toBeNull();
  });
});

describe('labels', () => {
  it('names each action as a coach would', () => {
    expect(actionLabel({ kind: 'beat', line: 'sixte' })).toBe('Beat 6');
    expect(actionLabel({ kind: 'engage', line: 'quarte' })).toBe('Engage 4');
    expect(actionLabel({ kind: 'footwork', move: 'lunge' })).toBe('Lunge');
    expect(actionLabel({ kind: 'footwork', move: 'half-lunge' })).toBe('Half lunge');
    expect(actionLabel({ kind: 'parry', number: 4 })).toBe('Parry 4');
    expect(actionLabel({ kind: 'extend' })).toBe('Extension');
    expect(actionLabel({ kind: 'distance', measure: 'medium' })).toBe('Medium distance');
    expect(actionLabel({ kind: 'hit', area: 'arm', with: 'lunge' })).toBe('Hits the arm with a lunge');
    expect(actionLabel({ kind: 'hit', area: 'body', with: 'arm' })).toBe('Hits the body');
    expect(actionLabel({ kind: 'hit', area: 'leg', with: 'fleche' })).toBe('Hits the front leg with a flèche');
  });
});

describe('review round 1: footwork is measured from the back foot', () => {
  const rearAnkle = (c: Combination, p: Poses, f: FencerId) => jointPosition(rig(c, p, f), `ankle_${rear(c, f)}`);
  const step = (c: Combination, p: Poses, f: FencerId, move: Extract<Action, { kind: 'footwork' }>['move']) => act(c, p, f, { kind: 'footwork', move });

  it.each(variants)('keeps a back foot that stands off the line where it is, along and across (%s)', (_, c, f) => {
    const p0 = start(c);
    // The coach drags the back foot 15 cm across the piste.
    const foot = `foot_${rear(c, f)}` as const;
    const target = rearAnkle(c, p0, f).add(new Vector3(0, 0, 0.15));
    const p = { ...p0, [f]: dragDot(p0[f], c.fencers[f], HEADING[f], foot, target) };
    const placed = rearAnkle(c, p, f);
    expect(placed.distanceTo(target)).toBeLessThan(0.02);
    for (const move of ['lunge', 'half-lunge', 'recover'] as const) {
      const after = rearAnkle(c, step(c, p, f, move).poses, f);
      expect(Math.hypot(after.x - placed.x, after.z - placed.z)).toBeLessThan(0.01);
    }
  });

  it.each(variants)('advances and retreats one step of the back foot, from a lunge as from en garde (%s)', (_, c, f) => {
    const guard = start(c);
    const lunged = step(c, guard, f, 'lunge').poses;
    // A lunge made by hand: the front foot dragged 40 cm forward.
    const front = `foot_${side(c, f)}` as const;
    const reach = jointPosition(rig(c, guard, f), `ankle_${side(c, f)}`).add(new Vector3(0.4 * FORWARD[f], 0, 0));
    const dragged = { ...guard, [f]: dragDot(guard[f], c.fencers[f], HEADING[f], front, reach) };
    for (const from of [guard, lunged, dragged]) {
      const was = rearAnkle(c, from, f);
      const adv = rearAnkle(c, step(c, from, f, 'advance').poses, f);
      const ret = rearAnkle(c, step(c, from, f, 'retreat').poses, f);
      expect((adv.x - was.x) * FORWARD[f]).toBeCloseTo(STEP_LENGTH, 2);
      expect((ret.x - was.x) * FORWARD[f]).toBeCloseTo(-STEP_LENGTH, 2);
      expect(Math.abs(adv.z - was.z)).toBeLessThan(0.01);
    }
    // And neither touches the weapon arm.
    const extended = act(c, guard, f, { kind: 'extend' }).poses;
    const advanced = step(c, extended, f, 'advance').poses;
    for (const n of weaponArm(c, f)) expect(advanced[f].joints[n]).toEqual(extended[f].joints[n]);
  });

  it.each(variants)('runs a flèche to the same place from a lunge as from en garde (%s)', (_, c, f) => {
    const guard = start(c);
    const lunged = step(c, guard, f, 'lunge').poses;
    const a = rearAnkle(c, step(c, guard, f, 'fleche').poses, f);
    const b = rearAnkle(c, step(c, lunged, f, 'fleche').poses, f);
    expect(a.distanceTo(b)).toBeLessThan(0.01);
  });

  it.each(variants)('lunges shallower when the opponent is close, with the back foot where it is (%s)', (_, c, f) => {
    // Nearly touching: hips 1.1 m apart.
    const p = apart(c, 0.55);
    const was = rearAnkle(c, p, f);
    for (const move of ['lunge', 'half-lunge'] as const) {
      const r = step(c, p, f, move);
      if (r.cramped === 'blocked') {
        expect(r.poses).toBe(p);
        continue;
      }
      expect(r.cramped).toBe('short');
      expect(rearAnkle(c, r.poses, f).distanceTo(was)).toBeLessThan(0.01);
      expect(toeAlong(c, r.poses, f)).toBeLessThanOrEqual(-toeAlong(c, r.poses, other(f)) + 1e-6);
    }
    // A hit with a lunge from there keeps the back foot too.
    const hit = act(c, p, f, { kind: 'hit', area: 'body', with: 'lunge' });
    expect(Math.abs(rearAnkle(c, hit.poses, f).x - was.x)).toBeLessThan(0.01);
  });

  it.each(variants)('does not advance into the opponent, and never backward (%s)', (_, c, f) => {
    // Room for part of a step only.
    const p = apart(c, 0.6);
    const was = rearAnkle(c, p, f);
    const r = step(c, p, f, 'advance');
    const now = rearAnkle(c, r.poses, f);
    expect((now.x - was.x) * FORWARD[f]).toBeGreaterThan(0.01);
    expect((now.x - was.x) * FORWARD[f]).toBeLessThan(STEP_LENGTH - 0.01);
    expect(r.cramped).toBe('short');
    expect(toeAlong(c, r.poses, f)).toBeLessThanOrEqual(-toeAlong(c, r.poses, other(f)) + 1e-6);
    // Toes already overlapping: nothing moves, and it says so.
    const jammed = apart(c, 0.4);
    for (const move of ['advance', 'fleche', 'lunge'] as const) {
      const blocked = step(c, jammed, f, move);
      expect(blocked.cramped).toBe('blocked');
      expect(blocked.poses).toBe(jammed);
    }
    // Retreat is always possible, and goes back.
    const back = rearAnkle(c, step(c, jammed, f, 'retreat').poses, f);
    expect((back.x - rearAnkle(c, jammed, f).x) * FORWARD[f]).toBeCloseTo(-STEP_LENGTH, 2);
  });

  it.each(variants)('keeps the back foot under a hit with a lunge that has to lean in (%s)', (_, c, f) => {
    let p = apart(c, 1.1);
    p = act(c, p, f, { kind: 'distance', measure: 'medium' }).poses;
    const was = rearAnkle(c, p, f);
    const hit = act(c, p, f, { kind: 'hit', area: 'body', with: 'lunge' });
    expect(hit.short).toBe(0);
    const now = rearAnkle(c, hit.poses, f);
    expect(Math.hypot(now.x - was.x, now.z - was.z)).toBeLessThan(0.01);
  });
});
