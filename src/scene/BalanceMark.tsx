import { Line } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Balance } from '../rig/balance.ts';

const RED = '#d0263a';

/**
 * Shown only when a fencer is off balance: a red ring on the floor under the
 * centre of mass, a line down to it, and a small "off balance" tag.
 */
export function BalanceMark({ balance }: { balance: Balance }) {
  const texture = useMemo(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 64 });
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffffe6';
    g.beginPath();
    g.roundRect(2, 2, 252, 60, 30);
    g.fill();
    g.strokeStyle = RED;
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = RED;
    g.font = '600 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('off balance', 128, 34);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const { centre, ground } = balance;
  return (
    <group>
      <mesh position={ground} rotation={[-Math.PI / 2, 0, 0]} renderOrder={8}>
        <ringGeometry args={[0.07, 0.095, 40]} />
        <meshBasicMaterial color={RED} transparent opacity={0.85} depthTest={false} />
      </mesh>
      <Line points={[centre, ground]} color={RED} lineWidth={1.2} dashed dashSize={0.04} gapSize={0.03} transparent opacity={0.7} />
      <sprite position={ground} scale={[0.09, 0.0225, 1]} center={[0.5, 1.6]} renderOrder={11}>
        <spriteMaterial map={texture} depthTest={false} transparent sizeAttenuation={false} />
      </sprite>
    </group>
  );
}
