import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vector3 } from 'three';
import { FENCERS, HEADING, type Combination } from '../model/combination.ts';
import { solveRig } from '../rig/kinematics.ts';
import { frameAt } from '../viewer/player.ts';

const SAMPLES_PER_STEP = 16;

/**
 * The path each épée point takes from one step to another, passing through
 * any motion-only steps between, as smooth playback would move it. Shown with
 * the ghost, so a disengage draws its arc under the blade.
 */
export function PointTrail({ c, from, to, onClick }: { c: Combination; from: number; to: number; onClick?: () => void }) {
  const paths = useMemo(() => {
    const n = Math.max(1, (to - from) * SAMPLES_PER_STEP);
    return FENCERS.map((f) => {
      const points: Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const frame = frameAt(c, from + ((to - from) * i) / n);
        points.push(solveRig(c.fencers[f], frame.poses[f], HEADING[f]).tip);
      }
      const length = points.reduce((sum, p, i) => (i ? sum + p.distanceTo(points[i - 1]) : 0), 0);
      return { f, points, length };
    });
  }, [c, from, to]);

  return (
    <>
      {paths.map(
        ({ f, points, length }) =>
          length > 0.03 && (
            <group key={f}>
              <Line
                points={points}
                color="#d0263a"
                lineWidth={onClick ? 3 : 2}
                transparent
                opacity={0.75}
                onClick={
                  onClick &&
                  ((e) => {
                    e.stopPropagation();
                    onClick();
                  })
                }
                onPointerOver={onClick && (() => (document.body.style.cursor = 'pointer'))}
                onPointerOut={onClick && (() => (document.body.style.cursor = ''))}
              />
              <mesh position={points[0]}>
                <sphereGeometry args={[0.01, 10, 8]} />
                <meshBasicMaterial color="#d0263a" transparent opacity={0.5} />
              </mesh>
            </group>
          ),
      )}
    </>
  );
}
