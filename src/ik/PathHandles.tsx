import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, Plane, SRGBColorSpace, Vector3 } from 'three';
import { useEditor } from '../editor/store.ts';
import { FENCERS, type Combination, type FencerId } from '../model/combination.ts';
import { frameAt } from '../viewer/player.ts';
import { pathMiddle, shapePath } from './path.ts';

let dragCount = 0;

/** A white disc with a red ring and a small grip mark: clearly not the red épée point handle. */
function useRingTexture() {
  const texture = useMemo(() => {
    const size = 96;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = canvas.getContext('2d')!;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = '#d0263a';
    g.stroke();
    g.fillStyle = '#d0263a';
    for (const dx of [-14, 0, 14]) {
      g.beginPath();
      g.arc(size / 2 + dx, size / 2, 5, 0, Math.PI * 2);
      g.fill();
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/**
 * A ball in the middle of each moving point's path into step `to`. Dragging
 * it bends the path (e.g. under the opponent's blade); the poses at either
 * end stay as they are.
 */
export function PathHandles({ c, to }: { c: Combination; to: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const drag = useRef<{ f: FencerId; plane: Plane; id: number } | null>(null);
  const [hover, setHover] = useState<FencerId | null>(null);

  const middles = useMemo(() => {
    // Every fencer gets a ball, even if the point hardly moves: dragging it
    // out sends the point round and back.
    return FENCERS.map((f) => ({ f, at: pathMiddle(c, to, f, (pos) => frameAt(c, pos)) }));
  }, [c, to]);
  const ring = useRingTexture();

  const start = (f: FencerId, at: Vector3) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    drag.current = { f, plane: new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), at), id: ++dragCount };
    if (controls) controls.enabled = false;
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const target = e.ray.intersectPlane(d.plane, new Vector3());
    if (!target) return;
    const s = useEditor.getState();
    s.setVia(d.f, shapePath(s.combination, to, d.f, target), d.id);
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    if (controls) controls.enabled = !useEditor.getState().cameraLocked;
  };

  return (
    <>
      {middles.map(({ f, at }) => (
        <group key={f} position={at}>
          <sprite
            renderOrder={12}
            scale={hover === f ? [0.05, 0.05, 1] : [0.042, 0.042, 1]}
            onPointerDown={start(f, at)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(f);
              document.body.style.cursor = 'grab';
            }}
            onPointerOut={() => {
              setHover(null);
              document.body.style.cursor = '';
            }}
          >
            <spriteMaterial map={ring} depthTest={false} transparent sizeAttenuation={false} />
          </sprite>
        </group>
      ))}
    </>
  );
}
