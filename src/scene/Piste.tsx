// A competition piste to scale (FIE): 14 m between the rear limits, 1.5–2 m
// wide, centre line, en garde lines 2 m either side, the last 2 m before each
// rear limit marked as the warning zone, and run-off beyond.

export const PISTE = {
  rearLimit: 7,
  enGarde: 2,
  warning: 5,
  width: 1.8,
  runOff: 1.75,
};

const SURFACE = '#a4acb5';
const WARNING = '#c4a29a';
const RUN_OFF = '#8f979f';
const LINE = '#ffffff';

function Strip({ from, to, color, y = 0.002 }: { from: number; to: number; color: string; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(from + to) / 2, y, 0]} receiveShadow>
      <planeGeometry args={[Math.abs(to - from), PISTE.width]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function Line({ x }: { x: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, 0]} receiveShadow>
      <planeGeometry args={[0.05, PISTE.width]} />
      <meshStandardMaterial color={LINE} roughness={0.7} />
    </mesh>
  );
}

export function Piste() {
  const { rearLimit: r, enGarde: g, warning: w, runOff } = PISTE;
  return (
    <group>
      <Strip from={-r - runOff} to={-r} color={RUN_OFF} />
      <Strip from={-r} to={-w} color={WARNING} />
      <Strip from={-w} to={w} color={SURFACE} />
      <Strip from={w} to={r} color={WARNING} />
      <Strip from={r} to={r + runOff} color={RUN_OFF} />
      {[-r, -w, -g, 0, g, w, r].map((x) => (
        <Line key={x} x={x} />
      ))}
    </group>
  );
}
