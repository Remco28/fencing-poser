import { Vector3 } from 'three';
import { FENCERS, type Combination, type FencerId, type Step, type StepCamera } from '../model/combination.ts';
import { JOINT_NAMES } from '../model/joints.ts';
import { jointPosition } from '../rig/kinematics.ts';
import { EDITOR_FOV, frameView, openingOf, pulledBack, type Opening } from '../scene/frame.ts';
import { rigsFor, viewFor } from '../scene/measure.ts';
import { currentStep, useEditor } from './store.ts';
import { useUi } from './ui.ts';

/** Everything to keep in frame for a fencer: every joint, the head, the point, and the floor under the hips. */
export function pointsOf(c: Combination, step: Step, who: 'both' | FencerId): Vector3[] {
  const rigs = rigsFor(c, step);
  return FENCERS.filter((f) => who === 'both' || who === f).flatMap((f) => {
    const rig = rigs[f];
    const head = jointPosition(rig, 'neck').add(new Vector3(0, 0.17 * rig.layout.height, 0));
    return [...JOINT_NAMES.map((j) => jointPosition(rig, j)), head, rig.tip.clone(), new Vector3(jointPosition(rig, 'pelvis').x, 0, 0)];
  });
}

/** The part of the window the 3D view can be seen through (all of it until the layout has been measured). */
export function clearNow(): { left: number; top: number; width: number; height: number } {
  return useUi.getState().clear ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function opening(): Opening {
  return openingOf(EDITOR_FOV, window.innerHeight, clearNow());
}

export type Look = 'side' | 'above' | 'work' | 'desk' | 'behindA' | 'behindB';

/** Where each look is taken from: the direction from the fencers toward the camera. */
const FROM: Record<'side' | 'above' | 'work' | 'desk', [number, number, number]> = {
  side: [0, 0.05, 1],
  above: [0, 1, 0.002],
  // The view to work in: from the side, a little above and a little toward A.
  work: [0.08, 0.2, 1],
  // The desk on opening: higher and further round, from further away.
  desk: [-0.32, 0.5, 1],
};

/** A view of the current step, framed on both fencers within the clear part of the window. */
export function lookAt(look: Look): StepCamera {
  const s = useEditor.getState();
  const step = currentStep(s);
  if (look === 'behindA' || look === 'behindB') {
    // Over the shoulder is a fixed place; step back when the clear part of the window is small.
    const clear = clearNow();
    return pulledBack(viewFor(look, step), Math.max(1, (window.innerHeight / clear.height) * 0.8));
  }
  if (look === 'desk') {
    // Always the same wide look at the desk, wherever on the piste the fencers are and however close together.
    const mid = (step.poses.A.root.x + step.poses.B.root.x) / 2;
    const wide = [new Vector3(mid - 3.6, 0, 0), new Vector3(mid + 3.6, 1.9, 0), new Vector3(mid, 0, 2.6), new Vector3(mid + 4.4, 0, -3.4)];
    return frameView(wide, new Vector3(...FROM.desk), opening(), 1);
  }
  return frameView(pointsOf(s.combination, step, 'both'), new Vector3(...FROM[look]), opening(), look === 'work' ? 1.16 : 1.08);
}
