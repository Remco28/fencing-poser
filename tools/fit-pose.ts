// Author a preset by describing where things should be, not by guessing angles.
//
//   node tools/fit-pose.ts en-garde
//
// Each spec names the angles to solve for and an objective: target positions
// and directions for hands, feet, knees and the blade, in world space for a
// 1.78 m right-handed fencer at the origin facing +X. The search is plain
// coordinate descent inside the joint limits. Paste the printed pose into
// src/presets/builtin.ts.

import { Vector3 } from 'three';
import { clampDof, type JointName } from '../src/model/joints.ts';
import { angle, DEFAULT_SETUP, type Pose } from '../src/model/types.ts';
import { jointAxis, jointPosition, solveRig, type Rig } from '../src/rig/kinematics.ts';

type Var = [JointName, string];

interface Spec {
  start: Pose;
  vary: Var[];
  /** Weighted error terms, by name; the objective is their sum. */
  terms: (rig: Rig) => Record<string, number>;
}

const at = (rig: Rig, joint: JointName, x: number | null, y: number | null, z: number | null) => {
  const p = jointPosition(rig, joint);
  return (x === null ? 0 : (p.x - x) ** 2) + (y === null ? 0 : (p.y - y) ** 2) + (z === null ? 0 : (p.z - z) ** 2);
};

const facing = (rig: Rig, joint: JointName, local: [number, number, number], want: [number, number, number]) =>
  1 - jointAxis(rig, joint, local).dot(new Vector3(...want).normalize());

const blade = (rig: Rig, want: [number, number, number]) =>
  1 - rig.tip.clone().sub(rig.guard).normalize().dot(new Vector3(...want).normalize());

const SPECS: Record<string, Spec> = {
  'en-garde': {
    start: {
      root: { x: 0, z: 0, lift: 0 },
      joints: {
        pelvis: { turn: -45, lean: 5 },
        hip_r: { flex: 30, twist: 40 },
        knee_r: { flex: 50 },
        hip_l: { flex: -10, abduct: 20, twist: 30 },
        knee_l: { flex: 50 },
        shoulder_r: { flex: 30, abduct: 20 },
        elbow_r: { flex: 70 },
        shoulder_l: { abduct: 80, twist: 60 },
        elbow_l: { flex: 90 },
        neck: { turn: 40 },
      },
    },
    vary: [
      ['hip_r', 'flex'], ['hip_r', 'abduct'], ['hip_r', 'twist'], ['knee_r', 'flex'],
      ['ankle_r', 'flex'], ['ankle_r', 'roll'],
      ['hip_l', 'flex'], ['hip_l', 'abduct'], ['hip_l', 'twist'], ['knee_l', 'flex'],
      ['ankle_l', 'flex'], ['ankle_l', 'roll'],
      ['pelvis', 'lean'], ['pelvis', 'side'],
      ['abdomen', 'turn'], ['chest', 'turn'],
      ['shoulder_r', 'flex'], ['shoulder_r', 'abduct'], ['shoulder_r', 'twist'], ['elbow_r', 'flex'],
      ['wrist_r', 'pronate'], ['wrist_r', 'flex'], ['wrist_r', 'deviate'],
      ['shoulder_l', 'flex'], ['shoulder_l', 'abduct'], ['shoulder_l', 'twist'], ['elbow_l', 'flex'], ['wrist_l', 'flex'],
      ['neck', 'flex'], ['neck', 'side'], ['neck', 'turn'],
    ],
    terms: (rig) => ({
      // Feet on the piste line, about a shoulder-and-a-half apart.
      at_ankle_r: 20 * at(rig, 'ankle_r', 0.32, null, 0),
      at_ankle_l: 20 * at(rig, 'ankle_l', -0.32, null, 0),
      // Front foot at the opponent, back foot nearly square to it, both flat.
      facing_ankle_r: 2 * facing(rig, 'ankle_r', [1, 0, 0], [1, 0, 0]),
      facing_ankle_l: 2 * facing(rig, 'ankle_l', [1, 0, 0], [0.3, 0, -1]),
      facing_ankle_r2: 2 * facing(rig, 'ankle_r', [0, 1, 0], [0, 1, 0]),
      facing_ankle_l2: 2 * facing(rig, 'ankle_l', [0, 1, 0], [0, 1, 0]),
      // Sitting down into the stance; knees over the feet.
      at_pelvis: 20 * at(rig, 'pelvis', null, 0.84, null),
      at_knee_r: 10 * at(rig, 'knee_r', 0.38, null, 0.0),
      at_knee_l: 3 * at(rig, 'knee_l', -0.3, null, -0.1),
      // Weapon hand forward at lower-chest height, elbow a hand's width off the body.
      at_wrist_r: 20 * at(rig, 'wrist_r', 0.44, 1.06, 0.1),
      at_elbow_r: 5 * at(rig, 'elbow_r', 0.2, 1.0, 0.16),
      // Point at the opponent, a little up; hand in sixte (thumb at one o'clock).
      blade_dir: 3 * blade(rig, [1, 0.1, -0.04]),
      facing_wrist_r: 1 * facing(rig, 'wrist_r', [1, 0, 0], [0, 0.9, 0.35]),
      // Back arm up and relaxed behind the head.
      at_wrist_l: 10 * at(rig, 'wrist_l', -0.3, 1.42, -0.3),
      at_elbow_l: 5 * at(rig, 'elbow_l', -0.24, 1.24, -0.34),
      // Torso upright, a touch forward; épée fencers stay tall.
      upright_pelvis: 4 * facing(rig, 'pelvis', [0, 1, 0], [0.08, 1, 0]),
      upright_chest: 4 * facing(rig, 'chest', [0, 1, 0], [0.05, 1, 0]),
      // Eyes on the opponent.
      facing_neck: 2 * facing(rig, 'neck', [1, 0, 0], [1, 0, 0]),
      facing_neck2: 2 * facing(rig, 'neck', [0, 1, 0], [0, 1, 0]),
    }),
  },
};

function setVar(pose: Pose, [joint, dof]: Var, value: number): Pose {
  return {
    ...pose,
    joints: { ...pose.joints, [joint]: { ...pose.joints[joint], [dof]: clampDof(joint, dof, value) } },
  };
}

function cost(spec: Spec, pose: Pose): number {
  let reg = 0;
  for (const [joint, dof] of spec.vary) reg += angle(pose, joint, dof) ** 2;
  return sum(spec.terms(solveRig(DEFAULT_SETUP, pose))) + 2e-5 * reg;
}

function sum(terms: Record<string, number>): number {
  return Object.values(terms).reduce((a, b) => a + b, 0);
}

function fit(spec: Spec): { pose: Pose; cost: number } {
  // Descent gets stuck in local minima; restart from shaken copies of the best.
  let best = descend(spec, spec.start);
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < 40; i++) {
    let shaken = best.pose;
    for (const v of spec.vary) shaken = setVar(shaken, v, angle(shaken, v[0], v[1]) + random() * 30);
    const next = descend(spec, shaken);
    if (next.cost < best.cost) best = next;
  }
  return evolve(spec, best, random);
}

// Coordinate descent cannot follow a valley that needs several joints to move
// together; a (1+1) evolution strategy with the 1/5 success rule can.
function evolve(spec: Spec, start: { pose: Pose; cost: number }, random: () => number) {
  let { pose, cost: best } = start;
  let sigma = 4;
  for (let i = 0; i < 60000 && sigma > 0.01; i++) {
    let candidate = pose;
    for (const v of spec.vary) {
      const gauss = (random() + random() + random()) * 0.577 * 1.73;
      candidate = setVar(candidate, v, angle(candidate, v[0], v[1]) + gauss * sigma);
    }
    const c = cost(spec, candidate);
    if (c < best) {
      pose = candidate;
      best = c;
      sigma *= 1.5;
    } else {
      sigma *= 0.97;
    }
  }
  return { pose, cost: best };
}

function descend(spec: Spec, start: Pose): { pose: Pose; cost: number } {
  let pose = start;
  let best = cost(spec, pose);
  for (const step of [16, 8, 4, 2, 1, 0.5]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const v of spec.vary) {
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

function rounded(pose: Pose): Pose {
  const joints: Pose['joints'] = {};
  for (const [joint, dofs] of Object.entries(pose.joints)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(dofs ?? {})) if (v !== undefined && Math.round(v) !== 0) out[k] = Math.round(v);
    if (Object.keys(out).length) joints[joint as JointName] = out;
  }
  return { root: pose.root, joints };
}

const name = process.argv[2];
const spec = SPECS[name];
if (!spec) {
  console.error(`usage: node tools/fit-pose.ts <${Object.keys(SPECS).join('|')}>`);
  process.exit(2);
}
const result = fit(spec);
const final = rounded(result.pose);
const rig = solveRig(DEFAULT_SETUP, final);
const show = (j: JointName) => jointPosition(rig, j).toArray().map((n) => n.toFixed(2)).join(', ');
console.error(`cost ${result.cost.toFixed(5)}`);
for (const j of ['pelvis', 'ankle_r', 'ankle_l', 'knee_r', 'knee_l', 'elbow_r', 'wrist_r', 'wrist_l'] as JointName[]) {
  console.error(`${j.padEnd(10)} ${show(j)}`);
}
for (const [k, v] of Object.entries(spec.terms(rig))) if (v > 0.002) console.error(`  error ${k.padEnd(16)} ${v.toFixed(3)}`);
console.error(`tip        ${rig.tip.toArray().map((n) => n.toFixed(2)).join(', ')}`);
console.log(JSON.stringify(final.joints, null, 0));
