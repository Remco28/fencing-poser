// Author built-in presets by describing where things should be, not by
// guessing angles.
//
//   node tools/fit-pose.ts               fit every preset, report the misses
//   node tools/fit-pose.ts parry-4       fit one (and what it builds on)
//   node tools/fit-pose.ts --write       fit all and write src/presets/fitted.ts
//
// World space is a 1.78 m right-handed fencer standing at the origin, facing
// +X, up +Y, their right +Z. A spec starts from another preset's angles,
// solves only the joints it lists in `vary`, and is scored by weighted error
// terms. The search is coordinate descent with restarts, then a (1+1)
// evolution strategy, all inside the joint limits. It is deterministic, so a
// spec that has not changed fits to the same pose every time.

import { writeFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { clampDof, type JointName } from '../src/model/joints.ts';
import { angle, DEFAULT_SETUP, type Pose } from '../src/model/types.ts';
import { jointAxis, jointPosition, solveRig, type Rig } from '../src/rig/kinematics.ts';

type Var = [JointName, string];
type V3 = [number, number, number];

interface Spec {
  /** Start from this preset's fitted angles (or from `angles` when given). */
  from?: string;
  /** Literal angles, used as-is when nothing is varied. */
  angles?: Pose['joints'];
  /** Angles to set before fitting. */
  set?: Pose['joints'];
  vary?: Var[];
  terms?: (rig: Rig, pose: Pose) => Record<string, number>;
}

// ---- error terms ----------------------------------------------------------

const at = (rig: Rig, joint: JointName, x: number | null, y: number | null, z: number | null) => {
  const p = jointPosition(rig, joint);
  return (x === null ? 0 : (p.x - x) ** 2) + (y === null ? 0 : (p.y - y) ** 2) + (z === null ? 0 : (p.z - z) ** 2);
};
const facing = (rig: Rig, joint: JointName, local: V3, want: V3) =>
  1 - jointAxis(rig, joint, local).dot(new Vector3(...want).normalize());
const blade = (rig: Rig, want: V3) => 1 - rig.tip.clone().sub(rig.guard).normalize().dot(new Vector3(...want).normalize());
/**
 * The thumb is the hand's +X: it shows pronation (thumb in) and supination
 * (thumb out). It is always square to the blade, so the target is taken
 * square to the blade too, leaving it only the turn of the hand to judge.
 */
const thumb = (rig: Rig, want: V3) => {
  const b = rig.tip.clone().sub(rig.guard).normalize();
  const w = new Vector3(...want);
  w.sub(b.multiplyScalar(w.dot(b))).normalize();
  return 1 - jointAxis(rig, 'wrist_r', [1, 0, 0]).dot(w);
};
const bend = (pose: Pose, joint: JointName, dof: string, want: number) => ((angle(pose, joint, dof) - want) / 45) ** 2;

const ARM: Var[] = [
  ['shoulder_r', 'flex'], ['shoulder_r', 'abduct'], ['shoulder_r', 'twist'], ['elbow_r', 'flex'],
  ['wrist_r', 'pronate'], ['wrist_r', 'flex'], ['wrist_r', 'deviate'],
];
const BACK_ARM: Var[] = [['shoulder_l', 'flex'], ['shoulder_l', 'abduct'], ['shoulder_l', 'twist'], ['elbow_l', 'flex']];
const LEGS: Var[] = [
  ['hip_r', 'flex'], ['hip_r', 'abduct'], ['hip_r', 'twist'], ['knee_r', 'flex'], ['ankle_r', 'flex'], ['ankle_r', 'roll'],
  ['hip_l', 'flex'], ['hip_l', 'abduct'], ['hip_l', 'twist'], ['knee_l', 'flex'], ['ankle_l', 'flex'], ['ankle_l', 'roll'],
];
const TORSO: Var[] = [['pelvis', 'lean'], ['pelvis', 'side'], ['abdomen', 'flex'], ['abdomen', 'turn'], ['chest', 'flex'], ['chest', 'turn']];
const HEAD: Var[] = [['neck', 'flex'], ['neck', 'side'], ['neck', 'turn']];

const eyesForward = (rig: Rig) => ({
  eyes: 2 * facing(rig, 'neck', [1, 0, 0], [1, 0, 0]),
  headUp: 2 * facing(rig, 'neck', [0, 1, 0], [0, 1, 0]),
});

/** The weapon hand held as in en garde: hand at the same height, point on line, sixte. */
const onGuard = (rig: Rig) => ({
  handHeight: 20 * at(rig, 'wrist_r', null, 1.02, 0.08),
  blade: 4 * blade(rig, [0.99, 0.12, -0.05]),
  thumb: 1.5 * thumb(rig, [0.07, 0.95, 0.31]),
});

const feetFlat =(rig: Rig, back: V3 = [0.3, 0, -1]) => ({
  frontFoot: 2 * facing(rig, 'ankle_r', [1, 0, 0], [1, 0, 0]),
  backFoot: 2 * facing(rig, 'ankle_l', [1, 0, 0], back),
  frontFlat: 2 * facing(rig, 'ankle_r', [0, 1, 0], [0, 1, 0]),
  backFlat: 2 * facing(rig, 'ankle_l', [0, 1, 0], [0, 1, 0]),
});

/**
 * A parry: the legs and body stay in en garde, the weapon arm moves. Targets
 * are where the wrist goes, which way the blade points, and which way the
 * thumb faces (up and out = supinated, in = pronated).
 */
function parry(wrist: V3, bladeDir: V3, thumbDir: V3, set?: Pose['joints'], extra: Var[] = []): Spec {
  return {
    from: 'en-garde',
    set,
    vary: [...ARM, ...extra],
    terms: (rig) => ({
      wrist: 30 * at(rig, 'wrist_r', ...wrist),
      blade: 4 * blade(rig, bladeDir),
      thumb: 1.5 * thumb(rig, thumbDir),
      ...eyesForward(rig),
    }),
  };
}

// ---- the presets -----------------------------------------------------------

export const SPECS: Record<string, Spec> = {
  // Approved by the coach on 2026-10-12: keep these numbers.
  'en-garde': {
    angles: {
      pelvis: { turn: -45, lean: -4, side: 4 },
      abdomen: { turn: 1 },
      chest: { turn: -5 },
      neck: { turn: 46, flex: 1, side: -5 },
      shoulder_r: { flex: 6, abduct: 12, twist: 32 },
      elbow_r: { flex: 83 },
      wrist_r: { pronate: -19, flex: -12, deviate: -5 },
      shoulder_l: { abduct: 48, twist: 56, flex: 34 },
      elbow_l: { flex: 112 },
      hip_r: { flex: 32, twist: 33, abduct: 27 },
      knee_r: { flex: 46 },
      ankle_r: { flex: 4, roll: -3 },
      hip_l: { flex: -4, abduct: 16, twist: 28 },
      knee_l: { flex: 40 },
      ankle_l: { flex: 30, roll: 18 },
    },
  },

  // Épée parries, right-handed. En garde holds the wrist at (0.46, 1.05, 0.08).
  'parry-6': parry([0.46, 1.09, 0.2], [0.92, 0.35, -0.12], [0, 0.9, 0.45]),
  'parry-4': parry([0.42, 1.09, -0.1], [0.9, 0.38, 0.14], [0, 0.55, 0.85]),
  'parry-3': parry([0.46, 1.09, 0.22], [0.92, 0.35, -0.12], [0, 0.3, -0.95]),
  'parry-8': parry([0.46, 0.98, 0.17], [0.86, -0.48, 0.06], [0, 0.5, 0.86]),
  'parry-7': parry([0.42, 0.99, -0.08], [0.86, -0.48, 0.12], [0, 0.5, 0.86]),
  'parry-2': parry([0.46, 0.98, 0.19], [0.86, -0.48, 0.06], [0, 0.15, -0.99]),
  // Prime winds the arm a long way round, so start the search near the answer.
  // Prime winds the arm a long way round, so start the search near the answer,
  // and let the chest turn with it as fencers do.
  'parry-1': parry(
    [0.32, 1.24, -0.06],
    [0.45, -0.88, -0.12],
    [0.25, 0.1, -0.96],
    { shoulder_r: { flex: 80, abduct: -10, twist: -70 }, elbow_r: { flex: 80 }, wrist_r: { pronate: 80 } },
    [['chest', 'turn'], ['abdomen', 'turn'], ...HEAD],
  ),

  extension: {
    from: 'en-garde',
    vary: ARM,
    terms: (rig, pose) => ({
      wrist: 30 * at(rig, 'wrist_r', 0.71, 1.27, 0.12),
      straight: bend(pose, 'elbow_r', 'flex', 0),
      blade: 4 * blade(rig, [1, 0.02, -0.06]),
      thumb: 1.5 * thumb(rig, [0, 0.9, 0.4]),
    }),
  },

  lunge: {
    from: 'extension',
    vary: [...LEGS, ...TORSO, ...ARM, ...BACK_ARM, ...HEAD],
    terms: (rig, pose) => ({
      // Front shin upright under the knee, back leg straight, feet about 1.15 m apart.
      frontAnkle: 20 * at(rig, 'ankle_r', 0.48, null, 0),
      backAnkle: 20 * at(rig, 'ankle_l', -0.68, null, 0.02),
      ...feetFlat(rig, [0.25, 0, -1]),
      frontShin: 10 * at(rig, 'knee_r', 0.5, null, 0),
      backLegStraight: bend(pose, 'knee_l', 'flex', 3),
      low: 20 * at(rig, 'pelvis', null, 0.66, null),
      torso: 4 * facing(rig, 'chest', [0, 1, 0], [0.18, 1, 0]),
      hand: 20 * at(rig, 'wrist_r', 0.78, 1.08, 0.1),
      straightArm: bend(pose, 'elbow_r', 'flex', 0),
      blade: 4 * blade(rig, [1, -0.03, -0.05]),
      thumb: 1.5 * thumb(rig, [0, 0.9, 0.4]),
      backHand: 5 * at(rig, 'wrist_l', -0.66, 0.9, -0.15),
      backElbow: 2 * at(rig, 'elbow_l', -0.4, 1.02, -0.16),
      ...eyesForward(rig),
    }),
  },

  // Footwork caught mid-step, so a combination can show the foot moving.
  advance: {
    from: 'en-garde',
    vary: [...LEGS, ['pelvis', 'lean']],
    terms: (rig) => ({
      frontAnkle: 20 * at(rig, 'ankle_r', 0.5, 0.17, 0),
      toesUp: 2 * facing(rig, 'ankle_r', [1, 0, 0], [1, 0.45, 0]),
      backAnkle: 20 * at(rig, 'ankle_l', -0.34, null, 0.01),
      backFoot: 2 * facing(rig, 'ankle_l', [1, 0, 0], [0.3, 0, -1]),
      backFlat: 2 * facing(rig, 'ankle_l', [0, 1, 0], [0, 1, 0]),
      height: 20 * at(rig, 'pelvis', null, 0.9, null),
      upright: 4 * facing(rig, 'pelvis', [0, 1, 0], [0.05, 1, 0]),
    }),
  },
  retreat: {
    from: 'en-garde',
    vary: [...LEGS, ['pelvis', 'lean']],
    terms: (rig) => ({
      frontAnkle: 20 * at(rig, 'ankle_r', 0.31, null, 0),
      frontFoot: 2 * facing(rig, 'ankle_r', [1, 0, 0], [1, 0, 0]),
      frontFlat: 2 * facing(rig, 'ankle_r', [0, 1, 0], [0, 1, 0]),
      backAnkle: 20 * at(rig, 'ankle_l', -0.55, 0.15, 0.01),
      backFoot: 2 * facing(rig, 'ankle_l', [1, 0, 0], [0.3, 0.1, -1]),
      height: 20 * at(rig, 'pelvis', null, 0.9, null),
      upright: 4 * facing(rig, 'pelvis', [0, 1, 0], [0.03, 1, 0]),
    }),
  },

  // The back leg swinging through, body thrown forward behind a straight arm.
  fleche: {
    from: 'extension',
    vary: [...LEGS, ...TORSO, ...ARM, ...BACK_ARM, ...HEAD],
    terms: (rig, pose) => ({
      frontAnkle: 20 * at(rig, 'ankle_r', 0.45, null, 0),
      frontFoot: 2 * facing(rig, 'ankle_r', [1, 0, 0], [1, 0, 0]),
      frontFlat: 2 * facing(rig, 'ankle_r', [0, 1, 0], [0.2, 1, 0]),
      backKnee: 10 * at(rig, 'knee_l', 0.3, 0.62, -0.08),
      backAnkle: 10 * at(rig, 'ankle_l', 0.05, 0.3, -0.06),
      lean: 6 * facing(rig, 'chest', [0, 1, 0], [0.6, 1, 0]),
      hand: 20 * at(rig, 'wrist_r', 0.95, 1.2, 0.08),
      straightArm: bend(pose, 'elbow_r', 'flex', 0),
      blade: 4 * blade(rig, [1, -0.05, -0.04]),
      backHand: 5 * at(rig, 'wrist_l', -0.35, 0.95, -0.25),
      ...eyesForward(rig),
    }),
  },

  // Body evasions in place: the legs stay in en garde and only the spine
  // bends (no turning, or the weapon arm swings off line). The blade keeps
  // threatening as in en garde.
  'stomach-tuck': {
    from: 'en-garde',
    vary: [['pelvis', 'lean'], ['abdomen', 'flex'], ['chest', 'flex'], ...ARM, ...HEAD],
    terms: (rig) => ({
      // Hips pulled back under a forward-curled spine; the head stays over the feet.
      hipsBack: 6 * facing(rig, 'pelvis', [0, 1, 0], [-0.25, 1, 0]),
      curl: 6 * facing(rig, 'chest', [0, 1, 0], [0.45, 1, 0]),
      head: 10 * at(rig, 'neck', 0.1, null, null),
      ...onGuard(rig),
      ...eyesForward(rig),
    }),
  },
  'lean-back': {
    from: 'en-garde',
    vary: [['pelvis', 'lean'], ['abdomen', 'flex'], ['chest', 'flex'], ...ARM, ...HEAD],
    terms: (rig) => ({
      lean: 6 * facing(rig, 'chest', [0, 1, 0], [-0.4, 1, 0]),
      hips: 4 * facing(rig, 'pelvis', [0, 1, 0], [-0.1, 1, 0]),
      ...onGuard(rig),
      ...eyesForward(rig),
    }),
  },
};

// ---- the search ------------------------------------------------------------

function setVar(pose: Pose, [joint, dof]: Var, value: number): Pose {
  return { ...pose, joints: { ...pose.joints, [joint]: { ...pose.joints[joint], [dof]: clampDof(joint, dof, value) } } };
}

function sum(terms: Record<string, number>) {
  return Object.values(terms).reduce((a, b) => a + b, 0);
}

function cost(spec: Spec, pose: Pose): number {
  let reg = 0;
  for (const [joint, dof] of spec.vary ?? []) reg += angle(pose, joint, dof) ** 2;
  return sum(spec.terms!(solveRig(DEFAULT_SETUP, pose), pose)) + 2e-5 * reg;
}

function descend(spec: Spec, start: Pose): { pose: Pose; cost: number } {
  let pose = start;
  let best = cost(spec, pose);
  for (const step of [16, 8, 4, 2, 1, 0.5]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const v of spec.vary!) {
        for (const dir of [1, -1]) {
          const candidate = setVar(pose, v, angle(pose, v[0], v[1]) + dir * step);
          const c = cost(spec, candidate);
          if (c < best - 1e-12) {
            pose = candidate;
            best = c;
            improved = true;
          }
        }
      }
    }
  }
  return { pose, cost: best };
}

function fit(spec: Spec, start: Pose): Pose {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let best = descend(spec, start);
  for (let i = 0; i < 30; i++) {
    let shaken = best.pose;
    for (const v of spec.vary!) shaken = setVar(shaken, v, angle(shaken, v[0], v[1]) + random() * 30);
    const next = descend(spec, shaken);
    if (next.cost < best.cost) best = next;
  }
  let { pose, cost: c } = best;
  let sigma = 4;
  for (let i = 0; i < 40000 && sigma > 0.01; i++) {
    let candidate = pose;
    for (const v of spec.vary!) candidate = setVar(candidate, v, angle(candidate, v[0], v[1]) + (random() + random() + random()) * sigma);
    const cc = cost(spec, candidate);
    if (cc < c) {
      pose = candidate;
      c = cc;
      sigma *= 1.5;
    } else sigma *= 0.97;
  }
  return pose;
}

function rounded(joints: Pose['joints']): Pose['joints'] {
  const out: Pose['joints'] = {};
  for (const [joint, dofs] of Object.entries(joints)) {
    const kept: Record<string, number> = {};
    for (const [k, v] of Object.entries(dofs ?? {})) if (v !== undefined && Math.round(v) !== 0) kept[k] = Math.round(v);
    if (Object.keys(kept).length) out[joint as JointName] = kept;
  }
  return out;
}

const fitted: Record<string, Pose['joints']> = {};

function solve(name: string): Pose['joints'] {
  if (fitted[name]) return fitted[name];
  const spec = SPECS[name];
  if (!spec) throw new Error(`no preset spec named ${name}`);
  const base = spec.angles ?? (spec.from ? solve(spec.from) : {});
  let start: Pose = { root: { x: 0, z: 0, lift: 0 }, joints: structuredClone(base) };
  for (const [joint, dofs] of Object.entries(spec.set ?? {})) {
    for (const [dof, v] of Object.entries(dofs ?? {})) start = setVar(start, [joint as JointName, dof], v ?? 0);
  }
  const joints = spec.vary && spec.terms ? rounded(fit(spec, start).joints) : rounded(start.joints);
  if (spec.terms) {
    const pose = { root: start.root, joints };
    const misses = Object.entries(spec.terms(solveRig(DEFAULT_SETUP, pose), pose)).filter(([, v]) => v > 0.01);
    console.error(`${name.padEnd(13)} ${misses.length ? misses.map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ') : 'ok'}`);
  }
  return (fitted[name] = joints);
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const names = args.filter((a) => !a.startsWith('--'));
for (const name of names.length ? names : Object.keys(SPECS)) solve(name);

if (write) {
  const body = Object.keys(SPECS)
    .map((name) => `  '${name}': ${JSON.stringify(solve(name))},`)
    .join('\n');
  writeFileSync(
    new URL('../src/presets/fitted.ts', import.meta.url),
    `// Generated by \`node tools/fit-pose.ts --write\`. Change the targets there, not these numbers.\n` +
      `import type { Pose } from '../model/types.ts';\n\n` +
      `export const FITTED: Record<string, Pose['joints']> = {\n${body}\n};\n`,
  );
  console.error('wrote src/presets/fitted.ts');
} else if (names.length) {
  for (const name of names) console.log(name, JSON.stringify(fitted[name]));
}
