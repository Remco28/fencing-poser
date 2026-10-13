import { Line } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import { clampDof, JOINT_BY_NAME, type JointName } from '../model/joints.ts';
import { angle, type FencerSetup, type Pose } from '../model/types.ts';
import { jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';
import { NUDGE_KEYS } from './keyboard.ts';

/** One colour per movement, shared with the rows of the joint controls. */
export const GUIDE_COLORS = ['#1f9e89', '#5b5bd6', '#d08a00'];

/** How far either side of the current angle a guide is drawn, in degrees. */
const SPAN = 30;
const SAMPLES = 16;

/**
 * The point whose path best shows what a joint does. Turning movements need
 * a point off the joint's own axis (the thumb, the toe, the nose) or they
 * would not move at all.
 */
function tracer(rig: Rig, joint: JointName): Vector3 {
  const H = rig.layout.height;
  const at = (j: JointName, local: [number, number, number]) => new Vector3(...local).applyMatrix4(rig.world[j]);
  switch (joint) {
    case 'pelvis':
    case 'abdomen':
    case 'chest':
      return at('neck', [0.07 * H, 0.09 * H, 0]);
    case 'neck':
      return at('neck', [0.07 * H, 0.09 * H, 0]);
    case 'shoulder_r':
    case 'shoulder_l':
    case 'elbow_r':
    case 'elbow_l':
      return jointPosition(rig, joint.endsWith('_r') ? 'wrist_r' : 'wrist_l');
    case 'wrist_r':
    case 'wrist_l':
      // The fingertips; for the weapon hand, a point a little way down the
      // blade, so the bends draw long, well separated paths.
      return weaponWrist(rig, joint)
        ? rig.guard.clone().add(rig.tip.clone().sub(rig.guard).setLength(0.3))
        : at(joint, [0, -rig.layout.hand, 0]);
    case 'hip_r':
    case 'hip_l':
    case 'knee_r':
    case 'knee_l':
      return jointPosition(rig, joint.endsWith('_r') ? 'ankle_r' : 'ankle_l');
    case 'ankle_r':
    case 'ankle_l':
      return at(joint, [rig.layout.toe, -rig.layout.ankleHeight, 0]);
    case 'grip':
      return rig.tip.clone();
  }
}

export /** Is this the wrist holding the épée? (Its grip frame starts at that wrist.) */
function weaponWrist(rig: Rig, joint: JointName): boolean {
  return jointPosition(rig, joint).distanceTo(new Vector3().setFromMatrixPosition(rig.world.grip)) < 1e-6;
}

/** Turning the hand is shown by the thumb clock instead of a path. */
const SHOWN_ON_DIAL = new Set(['wrist_r.pronate', 'wrist_l.pronate']);

interface Guide {
  points: Vector3[];
  /** Index of the point nearest the current angle. */
  current: number;
  dofIndex: number;
}

export function guidesFor(setup: FencerSetup, pose: Pose, heading: number, joint: JointName, spineTogether = false): Guide[] {
  const together = spineTogether && (joint === 'abdomen' || joint === 'chest');
  return JOINT_BY_NAME[joint].dofs.flatMap((d, dofIndex) => {
    if (SHOWN_ON_DIAL.has(`${joint}.${d.key}`)) return [];
    const now = angle(pose, joint, d.key);
    const lo = clampDof(joint, d.key, now - SPAN);
    const hi = clampDof(joint, d.key, now + SPAN);
    const points: Vector3[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const value = lo + ((hi - lo) * i) / SAMPLES;
      const p = together
        ? {
            ...pose,
            joints: {
              ...pose.joints,
              abdomen: { ...pose.joints.abdomen, [d.key]: clampDof('abdomen', d.key, angle(pose, 'abdomen', d.key) + (value - now) * 0.55) },
              chest: { ...pose.joints.chest, [d.key]: clampDof('chest', d.key, angle(pose, 'chest', d.key) + (value - now) * 0.45) },
            },
          }
        : { ...pose, joints: { ...pose.joints, [joint]: { ...pose.joints[joint], [d.key]: value } } };
      points.push(tracer(solveRig(setup, p, heading), joint));
    }
    const current = hi > lo ? Math.round(((now - lo) / (hi - lo)) * SAMPLES) : 0;
    return [{ points, current, dofIndex }];
  });
}

/** A small round key label, drawn to a canvas and kept a fixed size on screen. */
function KeyTag({ text, color, position, strong }: { text: string; color: string; position: Vector3; strong: boolean }) {
  const texture = useMemo(() => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = color;
    g.font = `bold ${size * 0.5}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, size / 2, size / 2 + 2);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[0.022, 0.022, 1]} renderOrder={11}>
      <spriteMaterial map={texture} depthTest={false} transparent opacity={strong ? 1 : 0.7} sizeAttenuation={false} />
    </sprite>
  );
}

/**
 * Faint paths showing where the selected joint's movements would take it,
 * one per movement. The movement in use (just nudged, or its row pointed at
 * in the joint controls) stands out and shows its keys at the two ends;
 * showing every key at once crowded small joints like the spine.
 */
export function MotionGuides({ guides, active }: { guides: Guide[]; /** The movement just used; drawn stronger. */ active: number | null }) {
  return (
    <>
      {guides.map((g) => {
        const color = GUIDE_COLORS[g.dofIndex];
        const strong = active === g.dofIndex;
        const [down, up] = NUDGE_KEYS[g.dofIndex].map((keys) => keys[0].toUpperCase());
        const first = g.points[0];
        const last = g.points[g.points.length - 1];
        const length = g.points.reduce((sum, p, i) => (i ? sum + p.distanceTo(g.points[i - 1]) : 0), 0);
        if (length < 0.01) return null;
        // Key tags sit just beyond the ends, and only on paths long enough to keep them apart.
        const beyond = (end: Vector3, inner: Vector3) => end.clone().add(end.clone().sub(inner).setLength(0.035));
        return (
          <group key={g.dofIndex}>
            <Line
              points={g.points}
              color={color}
              lineWidth={strong ? 3 : 1.6}
              transparent
              opacity={strong ? 0.95 : 0.55}
              depthTest={false}
              renderOrder={9}
            />
            <mesh position={g.points[g.current]} renderOrder={10}>
              <sphereGeometry args={[0.012, 12, 10]} />
              <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
            </mesh>
            {strong && length > 0.08 && (
              <>
                <KeyTag text={down} color={color} position={beyond(first, g.points[1])} strong={strong} />
                <KeyTag text={up} color={color} position={beyond(last, g.points[g.points.length - 2])} strong={strong} />
              </>
            )}
          </group>
        );
      })}
    </>
  );
}

/** Briefly remembers which movement was last used, so its guide can stand out. */
export function useRecentNudge(lastNudge: { dofIndex: number; id: number } | null): number | null {
  const [recent, setRecent] = useState<number | null>(null);
  useEffect(() => {
    if (!lastNudge) return;
    setRecent(lastNudge.dofIndex);
    const t = setTimeout(() => setRecent(null), 1500);
    return () => clearTimeout(t);
  }, [lastNudge]);
  return recent;
}
