import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { Plane, Vector3 } from 'three';
import { activePose, useEditor } from '../editor/store.ts';
import type { FencerSetup, Pose } from '../model/types.ts';
import { solveRig } from '../rig/kinematics.ts';
import { dragHandle, handlePositions, type Handle } from './ik.ts';

const HANDLE_COLOR: Record<Handle, string> = {
  hand_r: '#e0703a',
  hand_l: '#e0703a',
  foot_r: '#3a7be0',
  foot_l: '#3a7be0',
  hips: '#7a3ae0',
  point: '#d0263a',
};

const RADIUS: Record<Handle, number> = { hand_r: 0.035, hand_l: 0.035, foot_r: 0.04, foot_l: 0.04, hips: 0.05, point: 0.03 };

export const HANDLE_NAMES: Record<Handle, string> = {
  hand_r: 'right hand',
  hand_l: 'left hand',
  foot_r: 'right foot',
  foot_l: 'left foot',
  hips: 'hips',
  point: 'épée point',
};

let dragCount = 0;

/**
 * Grab a hand, foot, the hips or the point and drag: the joints in between
 * follow. Dragging moves in the plane facing the camera, so a side view moves
 * things forward/back and up/down, and a top view moves them across the floor.
 */
export function Handles({ setup, pose, heading }: { setup: FencerSetup; pose: Pose; heading: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const positions = useMemo(() => handlePositions(solveRig(setup, pose, heading)), [setup, pose, heading]);
  const drag = useRef<{ handle: Handle; plane: Plane; id: number } | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);

  const start = (handle: Handle) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    const normal = camera.getWorldDirection(new Vector3());
    drag.current = { handle, plane: new Plane().setFromNormalAndCoplanarPoint(normal, positions[handle]), id: ++dragCount };
    if (controls) controls.enabled = false;
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const target = e.ray.intersectPlane(d.plane, new Vector3());
    if (!target) return;
    const s = useEditor.getState();
    s.dragPose(dragHandle(activePose(s), setup, heading, d.handle, target), d.id);
  };

  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    if (controls) controls.enabled = true;
  };

  return (
    <>
      {(Object.keys(positions) as Handle[]).map((h) => (
        <mesh
          key={h}
          position={positions[h]}
          renderOrder={10}
          userData={{ handle: h }}
          onPointerDown={start(h)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(h);
            document.body.style.cursor = 'grab';
          }}
          onPointerOut={() => {
            setHover(null);
            document.body.style.cursor = '';
          }}
        >
          <sphereGeometry args={[RADIUS[h] * (hover === h ? 1.3 : 1), 20, 16]} />
          <meshBasicMaterial color={HANDLE_COLOR[h]} transparent opacity={hover === h ? 0.95 : 0.75} depthTest={false} />
        </mesh>
      ))}
    </>
  );
}
