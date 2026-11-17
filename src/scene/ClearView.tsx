import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { PerspectiveCamera } from 'three';

/**
 * The 3D view fills the whole window, behind the panels. This slides the
 * picture so that what the camera looks at sits in the middle of the part
 * left clear, and glides there when a panel opens or closes.
 */
export function ClearView({ clear }: { clear: { left: number; top: number; width: number; height: number } | null }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const at = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => invalidate(), [clear, size, invalidate]);
  useFrame((_, delta) => {
    const c = clear;
    const want = c ? { x: c.left + c.width / 2 - size.width / 2, y: c.top + c.height / 2 - size.height / 2 } : { x: 0, y: 0 };
    const now = at.current ?? want;
    // Ease toward the new place; snap when close, so it comes to rest.
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 9);
    const x = Math.abs(want.x - now.x) < 0.5 ? want.x : now.x + (want.x - now.x) * k;
    const y = Math.abs(want.y - now.y) < 0.5 ? want.y : now.y + (want.y - now.y) * k;
    const view = camera.view;
    if (at.current && x === now.x && y === now.y && view?.fullWidth === size.width && view.fullHeight === size.height) return;
    at.current = { x, y };
    camera.setViewOffset(size.width, size.height, -x, -y, size.width, size.height);
    if (x !== want.x || y !== want.y) invalidate();
  });
  return null;
}
