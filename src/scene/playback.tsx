import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Vector3 } from 'three';
import type { StepCamera } from '../model/combination.ts';
import { fitToAspect } from './CameraRig.tsx';

/** Mount only while playing; keep demand rendering awake until playback stops. */
export function Ticker({ onTick }: { onTick: (ms: number) => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const first = useRef(true);
  useEffect(() => {
    first.current = true;
    invalidate();
  }, [invalidate]);
  useFrame((_, delta) => {
    // The first delta can include a long idle period before Play was pressed.
    if (first.current) first.current = false;
    else onTick(Math.min(delta, 0.1) * 1000);
    invalidate();
  });
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
