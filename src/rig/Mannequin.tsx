import { RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';
import type { Matrix4 } from 'three';
import type { JointName } from '../model/joints.ts';
import type { FencerSetup, Pose } from '../model/types.ts';
import { Epee } from './Epee.tsx';
import { solveRig } from './kinematics.ts';
import type { Layout } from './layout.ts';

const WOOD = '#d9b68c';
const WOOD_JOINT = '#b98c5f';
const SELECTED = '#e0703a';
const HOVER = '#ecc9a0';

interface Props {
  setup: FencerSetup;
  pose: Pose;
  heading?: number;
  selected?: JointName | null;
  onSelect?: (joint: JointName) => void;
}

export function Mannequin({ setup, pose, heading = 0, selected = null, onSelect }: Props) {
  const rig = useMemo(() => solveRig(setup, pose, heading), [setup, pose, heading]);
  const [hovered, setHovered] = useState<JointName | null>(null);
  const L = rig.layout;
  const H = L.height;
  const b = L.build;
  const weaponSide = setup.handedness === 'right' ? 'r' : 'l';

  const part = (joint: JointName, children: ReactNode) => (
    <Part
      key={joint}
      joint={joint}
      ball={(BALLS[joint] ?? 0) * H * (joint.startsWith('wrist') ? 1 : b)}
      matrix={rig.world[joint]}
      color={joint === selected ? SELECTED : joint === hovered ? HOVER : WOOD}
      onSelect={onSelect}
      onHover={setHovered}
    >
      {children}
    </Part>
  );

  const limbs = (['r', 'l'] as const).flatMap((s) => [
    part(`shoulder_${s}`, <Capsule length={L.upperArm} radius={0.03 * H * b} />),
    part(`elbow_${s}`, <Capsule length={L.forearm} radius={0.025 * H * b} />),
    part(
      `wrist_${s}`,
      s === weaponSide ? (
        <RoundedBox args={[0.05 * H, L.fist, 0.032 * H]} radius={0.012 * H} position={[0, -L.fist / 2, 0]} castShadow>
          <Wood />
        </RoundedBox>
      ) : (
        <RoundedBox args={[0.045 * H, L.hand, 0.022 * H]} radius={0.01 * H} position={[0, -L.hand / 2, 0]} castShadow>
          <Wood />
        </RoundedBox>
      ),
    ),
    part(`hip_${s}`, <Capsule length={L.thigh} radius={0.047 * H * b} />),
    part(`knee_${s}`, <Capsule length={L.shank} radius={0.034 * H * b} />),
    part(`ankle_${s}`, <Foot layout={L} />),
  ]);

  return (
    <group>
      {part('pelvis', <Ellipsoid position={[0, -0.005 * H, 0]} radii={[0.07 * H, 0.055 * H, 0.1 * H * b]} />)}
      {part('abdomen', <Ellipsoid position={[0, 0.055 * H, 0]} radii={[0.06 * H, 0.068 * H, 0.085 * H * b]} />)}
      {part('chest', <Ellipsoid position={[0, 0.075 * H, 0]} radii={[0.07 * H, 0.085 * H, 0.118 * H * b]} />)}
      {part(
        'neck',
        <>
          <mesh position={[0, 0.03 * H, 0]} castShadow>
            <cylinderGeometry args={[0.022 * H, 0.025 * H, 0.06 * H, 16]} />
            <meshStandardMaterial color={WOOD_JOINT} roughness={0.7} />
          </mesh>
          <Ellipsoid position={[0.008 * H, 0.088 * H, 0]} radii={[0.062 * H, 0.074 * H, 0.052 * H]} />
        </>,
      )}
      {limbs}
      <group matrixAutoUpdate={false} matrix={rig.world.grip}>
        <Epee
          highlight={selected === 'grip' ? SELECTED : hovered === 'grip' ? HOVER : null}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect?.('grip');
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered('grip');
          }}
          onPointerOut={() => setHovered(null)}
        />
      </group>
    </group>
  );
}

function Part(props: {
  joint: JointName;
  matrix: Matrix4;
  color: string;
  /** Radius of the joint ball at this part's pivot; 0 for none. */
  ball: number;
  children: ReactNode;
  onSelect?: (joint: JointName) => void;
  onHover: (joint: JointName | null) => void;
}) {
  return (
    <group
      matrixAutoUpdate={false}
      matrix={props.matrix}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        props.onSelect?.(props.joint);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        props.onHover(props.joint);
      }}
      onPointerOut={() => props.onHover(null)}
    >
      <ColorContext value={props.color}>
        {props.ball > 0 && (
          <mesh castShadow>
            <sphereGeometry args={[props.ball, 20, 16]} />
            <meshStandardMaterial color={props.color === WOOD ? WOOD_JOINT : props.color} roughness={0.6} />
          </mesh>
        )}
        {props.children}
      </ColorContext>
    </group>
  );
}

// Children of a part take the part's colour unless they set their own material.
const ColorContext = createContext(WOOD);

function Wood() {
  return <meshStandardMaterial color={use(ColorContext)} roughness={0.65} />;
}

function Capsule({ length, radius }: { length: number; radius: number }) {
  return (
    <mesh position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, Math.max(length - 2 * radius, 0.001), 8, 20]} />
      <Wood />
    </mesh>
  );
}

function Ellipsoid({ position, radii }: { position: [number, number, number]; radii: [number, number, number] }) {
  return (
    <mesh position={position} scale={radii} castShadow>
      <sphereGeometry args={[1, 32, 24]} />
      <Wood />
    </mesh>
  );
}

function Foot({ layout }: { layout: Layout }) {
  const height = 0.042 * layout.height;
  const length = layout.heel + layout.toe;
  return (
    <RoundedBox
      args={[length, height, layout.footWidth]}
      radius={height / 2.2}
      position={[(layout.toe - layout.heel) / 2, -layout.ankleHeight + height / 2, 0]}
      castShadow
    >
      <Wood />
    </RoundedBox>
  );
}

/** Joint ball radius at each pivot, as a fraction of height. */
const BALLS: Partial<Record<JointName, number>> = {
  abdomen: 0.045,
  chest: 0.05,
  shoulder_r: 0.036,
  shoulder_l: 0.036,
  elbow_r: 0.029,
  elbow_l: 0.029,
  wrist_r: 0.022,
  wrist_l: 0.022,
  hip_r: 0.05,
  hip_l: 0.05,
  knee_r: 0.04,
  knee_l: 0.04,
  ankle_r: 0.03,
  ankle_l: 0.03,
};
