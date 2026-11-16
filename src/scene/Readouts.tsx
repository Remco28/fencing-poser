import { Line } from '@react-three/drei';
import { INK } from '../design.ts';
import type { Measurements } from './measure.ts';

/** The measured lines, drawn in the scene: front foot to front foot, point to nearest target. */
export function ReadoutLines({ m }: { m: Measurements }) {
  return (
    <>
      <Line points={[m.feet.from, m.feet.to]} color={INK} lineWidth={2} dashed dashSize={0.08} gapSize={0.05} />
      {(['A', 'B'] as const).map(
        (f) =>
          m.reach[f].distance > 0.005 && (
            <Line key={f} points={[m.reach[f].from, m.reach[f].to]} color={INK} lineWidth={1.3} dashed dashSize={0.04} gapSize={0.03} />
          ),
      )}
    </>
  );
}
