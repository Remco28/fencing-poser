import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import type { StepCamera } from '../model/combination.ts';

/**
 * Frames a set of points without changing the angle of view: the camera
 * slides along its line of sight until everything fits, with a little room.
 */
export function FitRig({
  request,
  points,
  onView,
}: {
  request: { id: number } | null;
  points: () => Vector3[];
  onView: (camera: StepCamera) => void;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3 } | null;

  useEffect(() => {
    if (!request || !controls) return;
    const pts = points();
    const center = new Box3().setFromPoints(pts).getCenter(new Vector3());
    // The camera's own axes: keep looking the same way, only slide back or forward.
    const back = camera.position.clone().sub(controls.target).normalize();
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    // Each point needs the camera far enough back that it falls inside both edges of the view.
    let distance = 0;
    for (const p of pts) {
      const v = p.clone().sub(center);
      const toward = v.dot(back);
      distance = Math.max(distance, toward + Math.abs(v.dot(right)) / tanH, toward + Math.abs(v.dot(up)) / tanV);
    }
    const position = center.clone().addScaledVector(back, distance * 1.1 + 0.2);
    onView({ position: position.toArray(), target: center.toArray() });
    // Fit once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  return null;
}
