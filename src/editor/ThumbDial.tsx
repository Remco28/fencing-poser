import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { Rig } from '../rig/kinematics.ts';
import { jointAxis, jointPosition } from '../rig/kinematics.ts';

const RADIUS = 0.1;

/**
 * A faint clock face around the wrist, square to the blade, with a hand
 * pointing where the thumb points: pronation and supination as fencers say
 * it ("thumb at one o'clock"), readable from any angle and through the guard.
 */
export function ThumbDial({ rig, side, weapon }: { rig: Rig; side: 'r' | 'l'; weapon: boolean }) {
  const { ring, ticks, twelve, thumb } = useMemo(() => {
    const wrist = `wrist_${side}` as const;
    const along = weapon ? rig.tip.clone().sub(rig.guard).normalize() : jointAxis(rig, wrist, [0, -1, 0]);
    const up = new Vector3(0, 1, 0).addScaledVector(along, -along.y);
    if (up.lengthSq() < 1e-6) up.set(1, 0, 0).addScaledVector(along, -along.x);
    up.normalize();
    const right = new Vector3().crossVectors(along, up);
    const center = weapon ? rig.guard.clone().addScaledVector(along, -0.02) : jointPosition(rig, wrist);
    const at = (deg: number, r: number) => {
      const a = (deg * Math.PI) / 180;
      return center.clone().addScaledVector(up, Math.cos(a) * r).addScaledVector(right, Math.sin(a) * r);
    };
    const thumbDir = jointAxis(rig, wrist, [1, 0, 0]);
    const thumbDeg = (Math.atan2(thumbDir.dot(right), thumbDir.dot(up)) * 180) / Math.PI;
    return {
      ring: Array.from({ length: 65 }, (_, i) => at((i * 360) / 64, RADIUS)),
      ticks: Array.from({ length: 12 }, (_, h) => [at(h * 30, RADIUS * (h % 3 === 0 ? 0.78 : 0.88)), at(h * 30, RADIUS)]),
      twelve: [at(0, RADIUS), at(0, RADIUS * 1.25)],
      thumb: [center, at(thumbDeg, RADIUS * 1.1)],
    };
  }, [rig, side, weapon]);

  const faint = { transparent: true, depthTest: false, renderOrder: 9 } as const;
  return (
    <group>
      <Line points={ring} color="#3c4248" lineWidth={1.2} opacity={0.5} {...faint} />
      {ticks.map((t, i) => (
        <Line key={i} points={t} color="#3c4248" lineWidth={i % 3 === 0 ? 1.6 : 1} opacity={0.5} {...faint} />
      ))}
      <Line points={twelve} color="#3c4248" lineWidth={2} opacity={0.7} {...faint} />
      <Line points={thumb} color="#e0703a" lineWidth={3} opacity={0.95} {...faint} />
    </group>
  );
}
