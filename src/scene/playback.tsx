import { useFrame, useThree } from '@react-three/fiber';
import type { Vector3 } from 'three';
import type { StepCamera } from '../model/combination.ts';
import { fitToAspect } from './CameraRig.tsx';

/** Calls back every animation frame with the milliseconds since the last one. */
export function Ticker({ onTick }: { onTick: (ms: number) => void }) {
  useFrame((_, delta) => onTick(Math.min(delta, 0.1) * 1000));
  return null;
}

/** While playing smoothly, the camera follows the combination's own views. */
export function CameraDriver({ view, fit = false }: { view: StepCamera | undefined; fit?: boolean }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
  useFrame(() => {
    if (!view || !controls) return;
    const v = fit ? fitToAspect(view, aspect) : view;
    camera.position.set(...v.position);
    controls.target.set(...v.target);
    controls.update();
  });
  return null;
}
