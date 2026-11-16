import { Box3, Vector3 } from 'three';
import type { StepCamera } from '../model/combination.ts';

/** The camera's field of view in the editor, in degrees (top to bottom of the whole window). */
export const EDITOR_FOV = 40;

/**
 * How much of the picture is free to look through, as the tangents of the
 * half-angles across and up. Panels cover part of the window, so the view is
 * framed on the part that is clear, not on the whole of it.
 */
export interface Opening {
  across: number;
  up: number;
}

export function openingOf(fov: number, windowHeight: number, clear: { width: number; height: number }): Opening {
  const tan = Math.tan((fov * Math.PI) / 360);
  return { across: (tan * clear.width) / windowHeight, up: (tan * clear.height) / windowHeight };
}

/**
 * Where to put the camera to see every point, looking from the given side
 * (`back` points from the subject toward the camera), with a little room.
 */
export function frameView(points: Vector3[], back: Vector3, opening: Opening, room = 1.08): StepCamera {
  const center = new Box3().setFromPoints(points).getCenter(new Vector3());
  const toward = back.clone().normalize();
  const right = new Vector3(0, 1, 0).cross(toward);
  // Looking straight down has no "right" of its own: use the piste's length.
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = toward.clone().cross(right);
  let distance = 0;
  for (const p of points) {
    const v = p.clone().sub(center);
    const depth = v.dot(toward);
    distance = Math.max(distance, depth + Math.abs(v.dot(right)) / opening.across, depth + Math.abs(v.dot(up)) / opening.up);
  }
  return { position: center.clone().addScaledVector(toward, distance * room + 0.2).toArray(), target: center.toArray() };
}

/** The same view from further away (k above 1) or nearer. */
export function pulledBack(view: StepCamera, k: number): StepCamera {
  const [tx, ty, tz] = view.target;
  const [px, py, pz] = view.position;
  return { target: view.target, position: [tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k] };
}
