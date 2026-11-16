import { RoundedBox } from '@react-three/drei';
import { ACCENT, SCENE } from '../design.ts';
import { BOARD_THICKNESS as DESK_DROP } from './Piste.tsx';

// The figures are about 30 cm tall on the desk, so a pencil beside them is
// over a metre long in the scene's measure. These show only in the opening
// view, where they give the figures their size; while posing, the desk is bare.

const HALF_TURN = Math.PI / 2;
const T = SCENE.things;

function Pencil() {
  const r = 0.045;
  return (
    <group position={[-0.6, r - DESK_DROP, 2.35]} rotation={[0, 0.16, 0]}>
      <mesh rotation={[0, 0, HALF_TURN]} castShadow>
        <cylinderGeometry args={[r, r, 1.0, 6]} />
        <meshStandardMaterial color={ACCENT} roughness={0.45} />
      </mesh>
      <mesh position={[0.6, 0, 0]} rotation={[0, 0, -HALF_TURN]} castShadow>
        <coneGeometry args={[r, 0.2, 6]} />
        <meshStandardMaterial color={T.pencilWood} roughness={0.7} />
      </mesh>
      <mesh position={[0.685, 0, 0]} rotation={[0, 0, -HALF_TURN]}>
        <coneGeometry args={[0.012, 0.05, 6]} />
        <meshStandardMaterial color={T.graphite} roughness={0.5} />
      </mesh>
      <mesh position={[-0.53, 0, 0]} rotation={[0, 0, HALF_TURN]} castShadow>
        <cylinderGeometry args={[r + 0.002, r + 0.002, 0.07, 16]} />
        <meshStandardMaterial color={T.ferrule} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[-0.6, 0, 0]} rotation={[0, 0, HALF_TURN]} castShadow>
        <cylinderGeometry args={[r - 0.001, r - 0.001, 0.08, 16]} />
        <meshStandardMaterial color={T.eraser} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Notebook() {
  const thick = 0.09;
  return (
    <group position={[4.4, thick / 2 - DESK_DROP, -3.4]} rotation={[0, -0.22, 0]}>
      <RoundedBox args={[1.5, thick, 2.0]} radius={0.03} castShadow receiveShadow>
        <meshStandardMaterial color={T.cover} roughness={0.75} />
      </RoundedBox>
      <mesh position={[0.02, 0, 0]}>
        <boxGeometry args={[1.47, thick - 0.02, 1.96]} />
        <meshStandardMaterial color={T.pages} roughness={0.9} />
      </mesh>
      <mesh position={[0.45, thick / 2 + 0.002, 0]}>
        <boxGeometry args={[0.05, 0.004, 2.0]} />
        <meshStandardMaterial color={T.band} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** `around`: where along the piste the fencers stand, so the things lie near them. */
export function DeskThings({ around }: { around: number }) {
  return (
    <group position={[around, 0, 0]}>
      <Pencil />
      <Notebook />
    </group>
  );
}
