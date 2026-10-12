import { Line } from '@react-three/drei';
import type { Measurements } from './measure.ts';

const FEET = '#2b6cb0';
const POINT = { A: '#d0263a', B: '#d0263a' };

/** The measured lines, drawn in the scene: front foot to front foot, point to nearest target. */
export function ReadoutLines({ m }: { m: Measurements }) {
  return (
    <>
      <Line points={[m.feet.from, m.feet.to]} color={FEET} lineWidth={2.5} dashed dashSize={0.08} gapSize={0.05} />
      {(['A', 'B'] as const).map(
        (f) =>
          m.reach[f].distance > 0.005 && (
            <Line key={f} points={[m.reach[f].from, m.reach[f].to]} color={POINT[f]} lineWidth={1.5} dashed dashSize={0.04} gapSize={0.03} />
          ),
      )}
    </>
  );
}
