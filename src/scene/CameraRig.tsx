import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import type { StepCamera } from '../model/combination.ts';

interface Controls {
  target: Vector3;
  update: () => void;
  addEventListener: (type: 'end', listener: () => void) => void;
  removeEventListener: (type: 'end', listener: () => void) => void;
}

export interface Flight {
  camera: StepCamera;
  id: number;
  /** Report the view once there (a chosen view), or not (returning to a saved one). */
  save: boolean;
}

const FLIGHT_SECONDS = 0.7;

/**
 * Glides the camera to each new flight's view, and reports the view whenever
 * the coach finishes orbiting by hand or a saving flight lands.
 */
export function CameraRig({ flight, onView }: { flight: Flight | null; onView?: (camera: StepCamera) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const moving = useRef<{ fromPos: Vector3; toPos: Vector3; fromTarget: Vector3; toTarget: Vector3; t: number; save: boolean } | null>(
    null,
  );
  const report = useRef(onView);
  report.current = onView;
  const current = () => ({ position: camera.position.toArray(), target: controls!.target.toArray() }) as StepCamera;

  useEffect(() => {
    if (!controls || !flight) return;
    moving.current = {
      fromPos: camera.position.clone(),
      toPos: new Vector3(...flight.camera.position),
      fromTarget: controls.target.clone(),
      toTarget: new Vector3(...flight.camera.target),
      t: 0,
      save: flight.save,
    };
  }, [flight, controls, camera]);

  useEffect(() => {
    if (!controls) return;
    const onEnd = () => {
      if (!moving.current) report.current?.(current());
    };
    controls.addEventListener('end', onEnd);
    return () => controls.removeEventListener('end', onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, camera]);

  useFrame((_, delta) => {
    const m = moving.current;
    if (!m || !controls) return;
    m.t = Math.min(1, m.t + delta / FLIGHT_SECONDS);
    const k = m.t < 0.5 ? 2 * m.t * m.t : 1 - (-2 * m.t + 2) ** 2 / 2;
    camera.position.lerpVectors(m.fromPos, m.toPos, k);
    controls.target.lerpVectors(m.fromTarget, m.toTarget, k);
    controls.update();
    if (m.t === 1) {
      moving.current = null;
      if (m.save) report.current?.(current());
    }
  });

  return null;
}
