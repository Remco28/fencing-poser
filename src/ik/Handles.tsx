import { Billboard } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { Plane, Vector3, type Group, type PerspectiveCamera } from 'three';
import { ACCENT, PAPER } from '../design.ts';
import { currentStep, useEditor } from '../editor/store.ts';
import type { FencerId } from '../model/combination.ts';
import type { FencerSetup, Pose } from '../model/types.ts';
import { solveRig } from '../rig/kinematics.ts';
import { dragDotKept, keptDots, keptInDrag, type Spots } from './drag.ts';
import { handlePositions, type Handle } from './ik.ts';

/** Every handle is drawn the same way: where it sits says what it is. */
export const HANDLE_COLOR: Record<Handle, string> = {
  hand_r: ACCENT,
  hand_l: ACCENT,
  foot_r: ACCENT,
  foot_l: ACCENT,
  hips: ACCENT,
  point: ACCENT,
};

const RADIUS: Record<Handle, number> = { hand_r: 0.04, hand_l: 0.04, foot_r: 0.042, foot_l: 0.042, hips: 0.048, point: 0.032 };

export const HANDLE_NAMES: Record<Handle, string> = {
  hand_r: 'right hand',
  hand_l: 'left hand',
  foot_r: 'right foot',
  foot_l: 'left foot',
  hips: 'hips',
  point: 'épée point',
};

/** However far away the camera is, a dot is never smaller on screen than this (its radius, in pixels). */
const MIN_PIXELS = 7.5;

let dragCount = 0;

/** A fresh id for one drag (3D handles and the sketch share them), so each drag undoes as one step. */
export function nextDragId(): number {
  return ++dragCount;
}

/**
 * Grab a hand, foot, the hips or the point and drag: the joints in between
 * follow. Dragging moves in the plane facing the camera, so a side view moves
 * things forward/back and up/down, and a top view moves them across the floor.
 */
export function Handles({ setup, pose, heading }: { setup: FencerSetup; pose: Pose; heading: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const positions = useMemo(() => handlePositions(solveRig(setup, pose, heading)), [setup, pose, heading]);
  // `from` is the pose at pointer-down, on `fencer` in step `stepId`; `spots` is where their kept things belong.
  const drag = useRef<{ handle: Handle; plane: Plane; id: number; from: Pose; fencer: FencerId; stepId: string; spots: Spots } | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);
  const keep = useEditor((s) => s.keep);
  const kept = keptDots(setup, keep);
  const dots = useRef<Partial<Record<Handle, Group | null>>>({});
  const height = useThree((s) => s.size.height);

  // Seen from far away the dots grow, so they can always be grabbed.
  useFrame(() => {
    const tan = Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360);
    for (const h of Object.keys(dots.current) as Handle[]) {
      const dot = dots.current[h];
      if (!dot) continue;
      const metresPerPixel = (2 * camera.position.distanceTo(dot.position) * tan) / height;
      dot.scale.setScalar(Math.max(1, (MIN_PIXELS * metresPerPixel) / RADIUS[h]));
    }
  });

  const start = (handle: Handle) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    const normal = camera.getWorldDirection(new Vector3());
    const s = useEditor.getState();
    drag.current = {
      handle,
      plane: new Plane().setFromNormalAndCoplanarPoint(normal, positions[handle]),
      id: nextDragId(),
      from: pose,
      fencer: s.active,
      stepId: currentStep(s).id,
      spots: s.spotsFor(s.active, keptInDrag(setup, s.keep, handle)),
    };
    if (controls) controls.enabled = false;
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const target = e.ray.intersectPlane(d.plane, new Vector3());
    if (!target) return;
    const s = useEditor.getState();
    // From the pose the drag began with: where the handle is decides the pose, not the route taken.
    // The store ignores the move if another fencer or step is being posed now, or something else has edited this fencer since.
    if (s.active !== d.fencer) return;
    const r = dragDotKept(d.from, setup, heading, d.handle, target, s.keep, d.spots);
    s.dragPose(r.pose, d.id, { fencer: d.fencer, stepId: d.stepId, pose: d.from, spots: d.spots, cut: r.cut });
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
        <group
          key={h}
          position={positions[h]}
          ref={(g) => {
            dots.current[h] = g;
          }}
        >
          {/* A paper dot with an ink ring, always facing the camera; filled with ink while it is kept in place. */}
          <Billboard>
            <mesh renderOrder={10} raycast={() => null} scale={hover === h ? 1.25 : 1}>
              <circleGeometry args={[RADIUS[h], 32]} />
              <meshBasicMaterial color={kept.includes(h) ? ACCENT : PAPER} transparent opacity={0.96} depthTest={false} />
            </mesh>
            <mesh renderOrder={11} raycast={() => null} scale={hover === h ? 1.25 : 1}>
              <ringGeometry args={[RADIUS[h] * 0.7, RADIUS[h], 32]} />
              <meshBasicMaterial color={ACCENT} transparent depthTest={false} />
            </mesh>
            {kept.includes(h) && (
              <mesh renderOrder={12} raycast={() => null}>
                <circleGeometry args={[RADIUS[h] * 0.28, 20]} />
                <meshBasicMaterial color={PAPER} transparent depthTest={false} />
              </mesh>
            )}
          </Billboard>
          {/* What is grabbed: an unseen ball a little larger than the dot. */}
          <mesh
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
            <sphereGeometry args={[RADIUS[h] * 1.3, 16, 12]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}
