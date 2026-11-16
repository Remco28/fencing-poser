import { useMemo } from 'react';
import { SCENE } from '../design.ts';
import { feltNap } from './textures.ts';

// A competition piste to scale (FIE): 14 m between the rear limits, 1.5–2 m
// wide, centre line, en garde lines 2 m either side, the last 2 m before each
// rear limit marked as the warning zone, and run-off beyond. Drawn as a board
// topped with felt, the lines painted on.

export const PISTE = {
  rearLimit: 7,
  enGarde: 2,
  warning: 5,
  width: 1.8,
  runOff: 1.75,
};

/** The board shows as a thin wooden edge round the felt. */
const EDGE = 0.11;
export const BOARD_THICKNESS = 0.06;
/** How many times the felt texture repeats per metre. */
const NAP = 2.2;

function Felt({ from, to, color }: { from: number; to: number; color: string }) {
  const length = Math.abs(to - from);
  const map = useMemo(() => {
    const t = feltNap().clone();
    t.repeat.set(length * NAP, PISTE.width * NAP);
    t.needsUpdate = true;
    return t;
  }, [length]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(from + to) / 2, 0.001, 0]} receiveShadow>
      <planeGeometry args={[length, PISTE.width]} />
      <meshStandardMaterial map={map} color={color} roughness={1} />
    </mesh>
  );
}

function Line({ x }: { x: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.003, 0]} receiveShadow>
      <planeGeometry args={[0.05, PISTE.width]} />
      <meshStandardMaterial color={SCENE.line} roughness={0.9} />
    </mesh>
  );
}

export function Piste() {
  const { rearLimit: r, enGarde: g, warning: w, runOff } = PISTE;
  const end = r + runOff;
  return (
    <group>
      <mesh position={[0, -BOARD_THICKNESS / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[2 * end + 2 * EDGE, BOARD_THICKNESS, PISTE.width + 2 * EDGE]} />
        <meshStandardMaterial color={SCENE.board} roughness={0.7} />
      </mesh>
      <Felt from={-end} to={-r} color={SCENE.feltRunOff} />
      <Felt from={-r} to={-w} color={SCENE.feltWarning} />
      <Felt from={-w} to={w} color={SCENE.felt} />
      <Felt from={w} to={r} color={SCENE.feltWarning} />
      <Felt from={r} to={end} color={SCENE.feltRunOff} />
      {[-r, -w, -g, 0, g, w, r].map((x) => (
        <Line key={x} x={x} />
      ))}
    </group>
  );
}
