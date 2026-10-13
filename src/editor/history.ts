import { FENCERS, type Combination, type Step } from '../model/combination.ts';
import { JOINT_BY_NAME, type JointName } from '../model/joints.ts';
import type { Pose } from '../model/types.ts';

// The history list names each edit in a coach's words ("Step 2 · A: right
// elbow"). Rather than every action naming itself, the name is read from
// what changed between the combination before and after.

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function poseChange(a: Pose, b: Pose): string | null {
  const joints = (Object.keys(JOINT_BY_NAME) as JointName[]).filter((j) => !same(a.joints[j] ?? {}, b.joints[j] ?? {}));
  const moved = !same(a.root, b.root);
  if (!joints.length && !moved) return null;
  if (joints.length > 3) return 'pose';
  const parts = joints.map((j) => JOINT_BY_NAME[j].label.toLowerCase());
  if (moved) parts.push('position');
  // Stomach and chest together are the spine.
  const spine = joints.includes('abdomen') && joints.includes('chest');
  return (spine ? ['spine', ...parts.filter((p) => p !== JOINT_BY_NAME.abdomen.label.toLowerCase() && p !== JOINT_BY_NAME.chest.label.toLowerCase())] : parts).join(', ');
}

function stepChange(a: Step, b: Step, index: number): string | null {
  const at = `Step ${index + 1}`;
  const poses = FENCERS.flatMap((f) => {
    const what = poseChange(a.poses[f], b.poses[f]);
    return what ? [`${f}: ${what}`] : [];
  });
  if (poses.length) return `${at} · ${poses.join(' · ')}`;
  if (!same(a.pins, b.pins) || !same(a.bend, b.bend) || !same(a.via, b.via))
    return `${at} · ${b.pins || b.bend || b.via ? 'shaped path' : 'straightened path'} ${index} → ${index + 1}`;
  if (a.label !== b.label) return `${at} · named “${b.label}”`;
  if (a.notes !== b.notes) return `${at} · notes`;
  if (!same(a.display, b.display)) return `${at} · what’s shown`;
  if (a.durationMs !== b.durationMs) return `${at} · timing`;
  if (!same(a.camera, b.camera)) return `${at} · view`;
  if (a.motionOnly !== b.motionOnly) return `${at} · made a normal step`;
  return null;
}

/** What changed from `a` to `b`, in a few words; null if nothing did. */
export function describeEdit(a: Combination, b: Combination): string | null {
  if (a.title !== b.title) return `Renamed “${b.title}”`;
  if (b.steps.length > a.steps.length) {
    const i = b.steps.findIndex((s, k) => s.id !== a.steps[k]?.id);
    return `Added step ${(i < 0 ? b.steps.length - 1 : i) + 1}`;
  }
  if (b.steps.length < a.steps.length) {
    const i = a.steps.findIndex((s, k) => s.id !== b.steps[k]?.id);
    return `Deleted step ${(i < 0 ? a.steps.length - 1 : i) + 1}`;
  }
  const from = a.steps.findIndex((s, k) => s.id !== b.steps[k].id);
  if (from >= 0) return `Moved step ${from + 1}`;
  for (const f of FENCERS) if (!same(a.fencers[f], b.fencers[f])) return `Fencer ${f}’s build`;
  if (!!a.sharedView !== !!b.sharedView) return b.sharedView ? 'One view for all steps' : 'A view for each step';
  if (a.collection !== b.collection) return b.collection ? `Filed under “${b.collection}”` : 'Unfiled';
  const changed = b.steps.flatMap((s, i) => {
    const what = stepChange(a.steps[i], s, i);
    return what ? [what] : [];
  });
  if (changed.length === 1) return changed[0];
  if (changed.length > 1) return `${changed.length} steps`;
  return null;
}
