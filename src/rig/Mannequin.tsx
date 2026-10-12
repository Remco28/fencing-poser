import { RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { createContext, use, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { JointName } from '../model/joints.ts';
import type { FencerSetup, Pose } from '../model/types.ts';
import { Epee } from './Epee.tsx';
import { FencerTag } from './FencerTag.tsx';
import { jointPosition, solveRig } from './kinematics.ts';
import type { Layout } from './layout.ts';

const WOOD = '#d9b68c';
const WOOD_JOINT = '#b98c5f';
const SELECTED = '#e0703a';
const TARGET = '#d23c3c';
const HOVER = '#ecc9a0';

interface Props {
  setup: FencerSetup;
  pose: Pose;
  heading?: number;
  selected?: JointName | null;
  onSelect?: (joint: JointName) => void;
  /** A tag floating above the head ("A", "B"). */
  label?: string;
  /** The fencer being posed; its tag is highlighted. */
  active?: boolean;
  onActivate?: () => void;
  /** Parts to show as the target of the action. */
  targets?: JointName[];
  /** A faint, unclickable copy (the previous step, behind this one). */
  ghost?: boolean;
}

export function Mannequin({ setup, pose, heading = 0, selected = null, onSelect, label, active = false, onActivate, targets = [], ghost = false }: Props) {
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
      color={joint === selected ? SELECTED : targets.includes(joint) ? TARGET : joint === hovered ? HOVER : WOOD}
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
        <Hand side={s} length={L.fist} width={0.05 * H} thick={0.032 * H} H={H} fist />
      ) : (
        <Hand side={s} length={L.hand} width={0.045 * H} thick={0.022 * H} H={H} />
      ),
    ),
    part(`hip_${s}`, <Capsule length={L.thigh} radius={0.047 * H * b} />),
    part(`knee_${s}`, <Capsule length={L.shank} radius={0.034 * H * b} />),
    part(`ankle_${s}`, <Foot layout={L} />),
  ]);

  const head = jointPosition(rig, 'neck');
  const root = useRef<Group>(null);

  // A ghost is see-through, casts no shadow and cannot be clicked.
  useLayoutEffect(() => {
    if (!ghost || !root.current) return;
    root.current.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.raycast = () => {};
      const m = mesh.material as MeshStandardMaterial;
      m.transparent = true;
      m.opacity = 0.18;
      m.depthWrite = false;
    });
  });

  return (
    <group ref={root}>
      {label && !ghost && (
        <FencerTag text={label} active={active} position={[head.x, head.y + 0.17 * H, head.z]} onClick={onActivate} />
      )}
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
            if (hitsHandle(e)) return;
            e.stopPropagation();
            onSelect?.('grip');
          }}
          onPointerOver={(e) => {
            if (hitsHandle(e)) return;
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
        if (hitsHandle(e)) return;
        e.stopPropagation();
        props.onSelect?.(props.joint);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (hitsHandle(e)) return;
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

/** Drag handles sit inside the body; a click that reaches one belongs to it. */
function hitsHandle(e: ThreeEvent<PointerEvent>): boolean {
  return e.intersections.some((i) => i.object.userData.handle);
}

// Children of a part take the part's colour unless they set their own material.
const ColorContext = createContext(WOOD);

function Wood() {
  return <meshStandardMaterial color={use(ColorContext)} roughness={0.65} />;
}

/**
 * A mitten with a thumb and a darker back, so the way the hand is turned
 * (pronation, supination) reads at a glance. In the hand's frame the fingers
 * point down (-Y), the thumb is on +X, and the palm faces the body.
 */
function Hand(props: { side: 'r' | 'l'; length: number; width: number; thick: number; H: number; fist?: boolean }) {
  const { length, width, thick, H } = props;
  const back = props.side === 'r' ? 1 : -1;
  const r = 0.0085 * H;
  return (
    <>
      <RoundedBox args={[width, length, thick]} radius={Math.min(thick, width) / 3} position={[0, -length / 2, 0]} castShadow>
        <Wood />
      </RoundedBox>
      <RoundedBox
        args={[width * 0.78, length * 0.7, thick * 0.3]}
        radius={thick * 0.12}
        position={[0, -length * 0.48, back * thick * 0.42]}
      >
        <meshStandardMaterial color={WOOD_JOINT} roughness={0.6} />
      </RoundedBox>
      <mesh
        position={[width / 2 + r * 0.4, -length * (props.fist ? 0.55 : 0.4), -back * thick * 0.1]}
        rotation={[0, 0, props.fist ? 0.15 : 0.35]}
        castShadow
      >
        <capsuleGeometry args={[r, length * (props.fist ? 0.45 : 0.32), 6, 12]} />
        <Wood />
      </mesh>
    </>
  );
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
