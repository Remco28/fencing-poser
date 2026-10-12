import { JOINT_BY_NAME, JOINT_NAMES, oppositeJoint } from './joints.ts';
import type { JointAngles, Pose } from './types.ts';

/**
 * Mirror a pose left-to-right: what the right arm did, the left arm now does.
 * Limb angles are anatomical, so they move across unchanged; directional
 * angles on central joints (turning, side bends) flip. The grip stays with
 * the weapon hand, which is mirrored along with it.
 */
export function mirrorPose(pose: Pose): Pose {
  const joints: Pose['joints'] = {};
  for (const name of JOINT_NAMES) {
    const source = pose.joints[oppositeJoint(name)];
    if (!source) continue;
    const def = JOINT_BY_NAME[name];
    const out: JointAngles = {};
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      const dof = def.dofs.find((d) => d.key === key);
      out[key] = dof?.mirrors ? -value : value;
    }
    joints[name] = out;
  }
  return { root: { ...pose.root, z: -pose.root.z }, joints };
}
