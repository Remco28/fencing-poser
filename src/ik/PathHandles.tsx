import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { Plane, Vector3 } from 'three';
import { useEditor } from '../editor/store.ts';
import { FENCERS, HEADING, type Combination, type FencerId } from '../model/combination.ts';
import { solveRig } from '../rig/kinematics.ts';
import { frameAt } from '../viewer/player.ts';
import { pathMiddle, shapePath } from './path.ts';

let dragCount = 0;

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
    const before = c.steps[to - 1];
    const after = c.steps[to];
    return FENCERS.flatMap((f) => {
      const start = solveRig(c.fencers[f], before.poses[f], HEADING[f]).tip;
      const end = solveRig(c.fencers[f], after.poses[f], HEADING[f]).tip;
      // Only points that travel (or paths already bent) get a ball.
      if (start.distanceTo(end) < 0.03 && !after.via?.[f]) return [];
      return [{ f, at: pathMiddle(c, to, f, (pos) => frameAt(c, pos)) }];
    });
  }, [c, to]);

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
          <mesh
            renderOrder={10}
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
            <sphereGeometry args={[hover === f ? 0.045 : 0.036, 20, 16]} />
            <meshBasicMaterial color="#d0263a" transparent opacity={0.9} depthTest={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}
