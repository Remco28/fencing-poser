import type { ThreeEvent } from '@react-three/fiber';
import { DoubleSide } from 'three';
import { EPEE } from './layout.ts';

const STEEL = '#c9ced6';

interface Props {
  highlight: string | null;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
}

/**
 * An épée in its grip frame: the pommel at the wrist, the blade running down
 * the hand's long axis (-Y), the bell's dome facing the point.
 */
export function Epee({ highlight, ...events }: Props) {
  const g = -EPEE.wristToGuard;
  const { guardRadius: a, guardDepth: h, blade } = EPEE;
  // The bell is a spherical cap: rim radius a, depth h.
  const R = (a * a + h * h) / (2 * h);
  const cap = Math.asin(a / R);
  const steel = highlight ?? STEEL;

  return (
    <group {...events}>
      {/* grip and pommel, mostly hidden in the fist */}
      <mesh position={[0, g / 2 + 0.01, 0]}>
        <cylinderGeometry args={[0.011, 0.013, Math.abs(g) - 0.01, 12]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <sphereGeometry args={[0.014, 12, 10]} />
        <meshStandardMaterial color={steel} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* bell guard */}
      <mesh position={[0, g + R, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <sphereGeometry args={[R, 40, 12, 0, Math.PI * 2, 0, cap]} />
        <meshStandardMaterial color={steel} metalness={0.75} roughness={0.3} side={DoubleSide} />
      </mesh>
      {/* triangular blade, tapering to the point */}
      <mesh position={[0, g - blade / 2, 0]} castShadow>
        <cylinderGeometry args={[0.0065, 0.0025, blade, 3]} />
        <meshStandardMaterial color={steel} metalness={0.8} roughness={0.25} />
      </mesh>
      {/* point d'arrêt; a wider invisible sleeve makes the thin blade easier to click */}
      <mesh position={[0, g - blade - 0.008, 0]}>
        <cylinderGeometry args={[0.0055, 0.0055, 0.016, 12]} />
        <meshStandardMaterial color="#222" roughness={0.6} />
      </mesh>
      <mesh position={[0, g - blade / 2, 0]} visible={false}>
        <cylinderGeometry args={[0.025, 0.025, blade, 6]} />
      </mesh>
    </group>
  );
}
