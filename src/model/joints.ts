// The mannequin's joints, in anatomical terms.
//
// Body frame at rest: the fencer faces +X, up is +Y, the fencer's right is +Z.
// Limbs hang straight down, palms facing the body, feet pointing forward.
//
// Every angle is stored in degrees under an anatomical name ("flex", "abduct"),
// never as a raw axis rotation. The joint table maps each name to an axis and a
// sign, per side where the sides differ. That keeps poses readable, makes left
// and right values mean the same thing, and turns mirroring into a swap.

export type Side = 'l' | 'r';
export type Axis = 'x' | 'y' | 'z';
export type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';

export const JOINT_NAMES = [
  'pelvis',
  'abdomen',
  'chest',
  'neck',
  'shoulder_r',
  'elbow_r',
  'wrist_r',
  'shoulder_l',
  'elbow_l',
  'wrist_l',
  'hip_r',
  'knee_r',
  'ankle_r',
  'hip_l',
  'knee_l',
  'ankle_l',
  'grip',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

export interface DofDef {
  key: string;
  label: string;
  axis: Axis;
  /** Sign that turns the anatomical angle into a rotation about `axis`. */
  sign: number;
  min: number;
  max: number;
  /** Central joints only: a directional angle (turn, side bend) flips when the pose is mirrored. */
  mirrors?: boolean;
}

export interface JointDef {
  name: JointName;
  label: string;
  /** Parent in the skeleton. `grip` hangs off whichever wrist holds the weapon. */
  parent: JointName | null;
  side?: Side;
  order: EulerOrder;
  dofs: DofDef[];
}

/** For limbs: sign on the right side; the left side uses the opposite sign. */
function sided(side: Side, rightSign: number): number {
  return side === 'r' ? rightSign : -rightSign;
}

function shoulder(side: Side): JointDef {
  return {
    name: `shoulder_${side}`,
    label: `${side === 'r' ? 'Right' : 'Left'} shoulder`,
    parent: 'chest',
    side,
    order: 'ZXY',
    dofs: [
      { key: 'flex', label: 'Forward / back', axis: 'z', sign: 1, min: -60, max: 180 },
      { key: 'abduct', label: 'Out to the side', axis: 'x', sign: sided(side, -1), min: -40, max: 180 },
      { key: 'twist', label: 'Turn out / in', axis: 'y', sign: sided(side, -1), min: -90, max: 90 },
    ],
  };
}

function elbow(side: Side): JointDef {
  return {
    name: `elbow_${side}`,
    label: `${side === 'r' ? 'Right' : 'Left'} elbow`,
    parent: `shoulder_${side}`,
    side,
    order: 'ZXY',
    dofs: [{ key: 'flex', label: 'Bend', axis: 'z', sign: 1, min: 0, max: 150 }],
  };
}

function wrist(side: Side): JointDef {
  return {
    name: `wrist_${side}`,
    label: `${side === 'r' ? 'Right' : 'Left'} wrist`,
    parent: `elbow_${side}`,
    side,
    // Pronation turns the forearm first, so bending follows the turned hand.
    order: 'YXZ',
    dofs: [
      { key: 'pronate', label: 'Pronate / supinate', axis: 'y', sign: sided(side, 1), min: -90, max: 90 },
      { key: 'flex', label: 'Bend to palm / back', axis: 'x', sign: sided(side, 1), min: -70, max: 80 },
      { key: 'deviate', label: 'Thumb / little finger', axis: 'z', sign: 1, min: -35, max: 25 },
    ],
  };
}

function hip(side: Side): JointDef {
  return {
    name: `hip_${side}`,
    label: `${side === 'r' ? 'Right' : 'Left'} hip`,
    parent: 'pelvis',
    side,
    order: 'ZXY',
    dofs: [
      { key: 'flex', label: 'Forward / back', axis: 'z', sign: 1, min: -40, max: 125 },
      { key: 'abduct', label: 'Out to the side', axis: 'x', sign: sided(side, -1), min: -30, max: 75 },
      { key: 'twist', label: 'Turn out / in', axis: 'y', sign: sided(side, -1), min: -45, max: 70 },
    ],
  };
}

function knee(side: Side): JointDef {
  return {
    name: `knee_${side}`,
    label: `${side === 'r' ? 'Right' : 'Left'} knee`,
    parent: `hip_${side}`,
    side,
    order: 'ZXY',
    dofs: [{ key: 'flex', label: 'Bend', axis: 'z', sign: -1, min: 0, max: 150 }],
  };
}

function ankle(side: Side): JointDef {
  return {
    name: `ankle_${side}`,
    label: `${side === 'r' ? 'Right' : 'Left'} ankle`,
    parent: `knee_${side}`,
    side,
    order: 'ZXY',
    dofs: [
      { key: 'flex', label: 'Toes up / down', axis: 'z', sign: 1, min: -50, max: 30 },
      { key: 'roll', label: 'Roll in / out', axis: 'x', sign: sided(side, 1), min: -25, max: 30 },
    ],
  };
}

function spine(name: 'abdomen' | 'chest', label: string, parent: JointName, scale: number): JointDef {
  return {
    name,
    label,
    parent,
    order: 'YZX',
    dofs: [
      { key: 'flex', label: 'Bend forward / back', axis: 'z', sign: -1, min: -30 * scale, max: 60 * scale },
      { key: 'side', label: 'Bend right / left', axis: 'x', sign: 1, min: -35 * scale, max: 35 * scale, mirrors: true },
      { key: 'turn', label: 'Turn right / left', axis: 'y', sign: -1, min: -45 * scale, max: 45 * scale, mirrors: true },
    ],
  };
}

export const JOINTS: JointDef[] = [
  {
    name: 'pelvis',
    label: 'Body (hips)',
    parent: null,
    // Turn first, so leaning is relative to where the body faces.
    order: 'YZX',
    dofs: [
      { key: 'turn', label: 'Turn right / left', axis: 'y', sign: -1, min: -180, max: 180, mirrors: true },
      { key: 'lean', label: 'Lean forward / back', axis: 'z', sign: -1, min: -45, max: 70 },
      { key: 'side', label: 'Lean right / left', axis: 'x', sign: 1, min: -35, max: 35, mirrors: true },
    ],
  },
  spine('abdomen', 'Stomach (lower spine)', 'pelvis', 1),
  spine('chest', 'Chest (upper spine)', 'abdomen', 0.8),
  {
    name: 'neck',
    label: 'Head',
    parent: 'chest',
    order: 'YZX',
    dofs: [
      { key: 'flex', label: 'Nod down / up', axis: 'z', sign: -1, min: -50, max: 30 },
      { key: 'side', label: 'Tilt right / left', axis: 'x', sign: 1, min: -40, max: 40, mirrors: true },
      { key: 'turn', label: 'Turn right / left', axis: 'y', sign: -1, min: -80, max: 80, mirrors: true },
    ],
  },
  shoulder('r'),
  elbow('r'),
  wrist('r'),
  shoulder('l'),
  elbow('l'),
  wrist('l'),
  hip('r'),
  knee('r'),
  ankle('r'),
  hip('l'),
  knee('l'),
  ankle('l'),
  {
    name: 'grip',
    label: 'Épée in the hand',
    parent: null,
    order: 'ZXY',
    dofs: [
      // The blade runs along the hand; tilt leans it toward the thumb.
      { key: 'tilt', label: 'Point toward thumb / little finger', axis: 'z', sign: 1, min: -20, max: 35 },
      { key: 'side', label: 'Point toward palm / back of hand', axis: 'x', sign: 1, min: -25, max: 25 },
    ],
  },
];

export const JOINT_BY_NAME: Record<JointName, JointDef> = Object.fromEntries(
  JOINTS.map((j) => [j.name, j]),
) as Record<JointName, JointDef>;

export function dofDef(joint: JointName, key: string): DofDef | undefined {
  return JOINT_BY_NAME[joint].dofs.find((d) => d.key === key);
}

export function clampDof(joint: JointName, key: string, value: number): number {
  const def = dofDef(joint, key);
  if (!def) return value;
  return Math.min(def.max, Math.max(def.min, value));
}

/** The joint on the other side of the body, or the same joint for central ones. */
export function oppositeJoint(name: JointName): JointName {
  if (name.endsWith('_r')) return name.replace(/_r$/, '_l') as JointName;
  if (name.endsWith('_l')) return name.replace(/_l$/, '_r') as JointName;
  return name;
}
