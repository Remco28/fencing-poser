import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { dotPositions, dragDot, dragDotKept, keptInDrag, keptInSlide, slideFencer, type Dot } from '../ik/drag.ts';
import { HEADING } from '../model/combination.ts';
import { jointPosition, solveRig } from '../rig/kinematics.ts';
import { START_X } from '../model/combination.ts';
import { mirrorPose } from '../model/mirror.ts';
import { JOINT_NAMES } from '../model/joints.ts';
import { angle, type Pose } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { activePose, currentStep, hasShot, poseDial, useEditor, viewIsShot } from './store.ts';

const initial = useEditor.getState();
const enGarde = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')!;
const state = () => useEditor.getState();
const pose = () => activePose(state());

beforeEach(() => useEditor.setState(initial, true));

describe('undo', () => {
  it('undoes a held key as one step, and redoes it', () => {
    state().select('elbow_r');
    const before = angle(pose(), 'elbow_r', 'flex');
    for (let i = 0; i < 5; i++) state().nudge(0, 2);
    expect(angle(pose(), 'elbow_r', 'flex')).toBe(before + 10);
    state().undo();
    expect(angle(pose(), 'elbow_r', 'flex')).toBe(before);
    state().redo();
    expect(angle(pose(), 'elbow_r', 'flex')).toBe(before + 10);
  });

  it('keeps different joints as separate steps', () => {
    state().setAngle('knee_r', 'flex', 90);
    state().setAngle('knee_l', 'flex', 90);
    state().undo();
    expect(angle(pose(), 'knee_r', 'flex')).toBe(90);
    expect(angle(pose(), 'knee_l', 'flex')).not.toBe(90);
  });

  it('stays inside joint limits when nudged past them', () => {
    state().select('knee_r');
    for (let i = 0; i < 40; i++) state().nudge(0, 10);
    expect(angle(pose(), 'knee_r', 'flex')).toBe(150);
  });

  it('brings back a deleted step', () => {
    state().addStep();
    state().setStepText({ label: 'Lunge' });
    state().deleteStep();
    expect(state().combination.steps.map((s) => s.label)).toEqual(['En garde']);
    state().undo();
    expect(state().combination.steps.map((s) => s.label)).toEqual(['En garde', 'Lunge']);
  });
});

describe('fencers', () => {
  it('poses only the active fencer', () => {
    state().setActive('B');
    state().setAngle('elbow_r', 'flex', 10);
    const step = currentStep(state());
    expect(angle(step.poses.B, 'elbow_r', 'flex')).toBe(10);
    expect(angle(step.poses.A, 'elbow_r', 'flex')).not.toBe(10);
  });

  it('advances each fencer toward the other', () => {
    state().advance(0.5);
    state().setActive('B');
    state().advance(0.5);
    const step = currentStep(state());
    expect(step.poses.A.root.x).toBeCloseTo(-START_X + 0.5);
    expect(step.poses.B.root.x).toBeCloseTo(START_X - 0.5);
  });

  it('mirrors a fencer in every step when they switch hands', () => {
    state().addStep();
    state().setSetup({ handedness: 'left' });
    for (const step of state().combination.steps) {
      expect(step.poses.A.joints).toEqual(mirrorPose(enGarde.pose).joints);
      expect(step.poses.B.joints).toEqual(enGarde.pose.joints);
    }
  });
});

describe('steps', () => {
  it('starts a new step from the current one and moves to it', () => {
    state().setAngle('knee_r', 'flex', 100);
    state().addStep();
    expect(state().stepIndex).toBe(1);
    expect(angle(pose(), 'knee_r', 'flex')).toBe(100);
    state().setAngle('knee_r', 'flex', 20);
    state().goToStep(0);
    expect(angle(pose(), 'knee_r', 'flex')).toBe(100);
  });

  it('reorders steps', () => {
    state().setStepText({ label: 'one' });
    state().addStep();
    state().setStepText({ label: 'two' });
    state().moveStep(-1);
    expect(state().combination.steps.map((s) => s.label)).toEqual(['two', 'one']);
    expect(state().stepIndex).toBe(0);
  });
});

describe('presets', () => {
  it('stores a pose made on a left-hander as right-handed', () => {
    state().setSetup({ handedness: 'left' });
    state().saveCurrentAsPreset('Mine');
    const mine = state().presets.find((p) => p.name === 'Mine')!;
    expect(mine.builtIn).toBe(false);
    expect(mine.pose.joints).toEqual(enGarde.pose.joints);
  });

  it('edits a built-in in place and restores the original', () => {
    state().setAngle('elbow_r', 'flex', 20);
    state().updatePreset('en-garde');
    let shown = state().presets.find((p) => p.id === 'en-garde')!;
    expect(shown.modified).toBe(true);
    expect(angle(shown.pose, 'elbow_r', 'flex')).toBe(20);

    state().removePreset('en-garde');
    shown = state().presets.find((p) => p.id === 'en-garde')!;
    expect(shown.modified).toBe(false);
    expect(shown.pose).toEqual(enGarde.pose);
  });

  it('applies a preset mirrored to a left-hander, keeping where they stand', () => {
    state().setSetup({ handedness: 'left' });
    state().setPosition(1.5);
    state().applyPreset(enGarde);
    expect(pose().joints).toEqual(mirrorPose(enGarde.pose).joints);
    expect(pose().root.x).toBe(1.5);
  });
});

describe('partial presets', () => {
  it('takes only the arms from a preset when asked', () => {
    const lunge = BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!;
    const legs = pose().joints.knee_r;
    state().applyPreset(lunge, 'upper');
    expect(pose().joints.knee_r).toEqual(legs);
    expect(pose().joints.elbow_r).toEqual(lunge.pose.joints.elbow_r);
  });
});

describe('whole spine', () => {
  it('bends stomach and chest together by default, sharing the angle', () => {
    state().select('chest');
    const before = { a: angle(pose(), 'abdomen', 'flex'), c: angle(pose(), 'chest', 'flex') };
    state().nudge(0, 10);
    const da = angle(pose(), 'abdomen', 'flex') - before.a;
    const dc = angle(pose(), 'chest', 'flex') - before.c;
    expect(da + dc).toBeCloseTo(10);
    expect(da).toBeGreaterThan(0);
    expect(dc).toBeGreaterThan(0);
  });

  it('types a whole-spine angle as the total of both', async () => {
    const { spineAngle } = await import('./store.ts');
    state().setAngle('abdomen', 'flex', 30);
    expect(spineAngle(pose(), 'flex')).toBeCloseTo(30);
  });

  it('moves one joint alone when the switch is off', () => {
    state().toggleSpineTogether();
    state().select('chest');
    const a = angle(pose(), 'abdomen', 'flex');
    state().nudge(0, 10);
    expect(angle(pose(), 'abdomen', 'flex')).toBe(a);
    state().toggleSpineTogether();
  });
});

describe('path shaping', () => {
  it('bends and straightens a path, undoably', () => {
    state().addStep();
    const pins = [
      { at: 0.7, joints: { elbow_r: { flex: 5 } } },
      { at: 0.3, joints: { elbow_r: { flex: 12 } } },
    ];
    state().setPins('A', pins, 1);
    expect(currentStep(state()).pins?.A?.map((p) => p.at)).toEqual([0.3, 0.7]);
    state().undo();
    expect(currentStep(state()).pins).toBeUndefined();
    state().redo();
    state().setPins('A', null);
    expect(currentStep(state()).pins).toBeUndefined();
  });
});

describe('history list', () => {
  const labels = () => [...state().past.map((p) => p.change.label), state().change.label, ...state().future.map((p) => p.change.label)];

  it('names each edit in plain words', () => {
    state().setAngle('elbow_r', 'flex', 90);
    state().applyPreset(enGarde, 'all');
    state().addStep();
    state().setStepText({ label: 'Disengage' });
    expect(labels().slice(1)).toEqual(['Step 1 · A: right elbow', 'Step 1 · A: En garde', 'Added step 2', 'Step 2 · named “Disengage”']);
  });

  it('jumps back to any edit, keeps later ones to jump forward to, and drops them on a new edit', () => {
    state().setAngle('knee_r', 'flex', 30);
    state().setAngle('knee_l', 'flex', 75);
    state().setAngle('elbow_r', 'flex', 50);
    state().jumpTo(1);
    expect(angle(pose(), 'knee_r', 'flex')).toBe(30);
    expect(angle(pose(), 'knee_l', 'flex')).not.toBe(75);
    expect(state().future).toHaveLength(2);
    state().jumpTo(3);
    expect(angle(pose(), 'elbow_r', 'flex')).toBe(50);
    state().jumpTo(1);
    state().setAngle('neck', 'flex', 10);
    expect(labels()).toHaveLength(3);
    expect(state().future).toHaveLength(0);
  });
});

describe('actions', () => {
  const labels = () => state().combination.steps.map((s) => s.label);
  const newStepMode = (on: boolean) => {
    if (state().actionsNewStep !== on) state().toggleActionsNewStep();
  };
  beforeEach(() => newStepMode(false));

  it('is one undo step, named in the history list', () => {
    const before = currentStep(state()).poses;
    state().act({ kind: 'footwork', move: 'lunge' });
    expect(currentStep(state()).poses).not.toEqual(before);
    expect(state().change.label).toBe('Step 1 · A: Lunge');
    state().undo();
    expect(currentStep(state()).poses).toEqual(before);
    expect(state().past).toHaveLength(0);
  });

  it('adds exactly one step in new-step mode, acts there, and undoes in one', () => {
    newStepMode(true);
    const first = currentStep(state()).poses;
    state().act({ kind: 'footwork', move: 'advance' });
    expect(state().combination.steps).toHaveLength(2);
    expect(state().stepIndex).toBe(1);
    expect(state().combination.steps[0].poses).toEqual(first);
    expect(pose().root.x).not.toBe(first.A.root.x);
    expect(labels()).toEqual(['En garde', 'A: Advance']);
    state().undo();
    expect(state().combination.steps).toHaveLength(1);
    expect(state().stepIndex).toBe(0);
    newStepMode(false);
  });

  it('sets an empty label, appends to automatic ones, and leaves a typed one alone', () => {
    state().addStep();
    state().act({ kind: 'footwork', move: 'lunge' });
    expect(labels()[1]).toBe('A: Lunge');
    state().setActive('B');
    state().act({ kind: 'parry', number: 4 });
    expect(labels()[1]).toBe('A: Lunge · B: Parry 4');
    state().setStepText({ label: 'Counter-attack' });
    state().act({ kind: 'extend' });
    expect(labels()[1]).toBe('Counter-attack');
  });

  it('highlights the target hit on the opponent, once', () => {
    state().act({ kind: 'distance', measure: 'short' });
    expect(state().act({ kind: 'hit', area: 'body', with: 'arm' }).short).toBe(0);
    state().act({ kind: 'hit', area: 'body', with: 'arm' });
    expect(currentStep(state()).display?.targets).toEqual([{ fencer: 'B', area: 'body' }]);
  });

  it('engages the blades', () => {
    state().act({ kind: 'distance', measure: 'short' });
    const a = currentStep(state()).poses.A;
    state().act({ kind: 'engage', line: 'sixte' });
    expect(state().change.label).toBe('Step 1 · A: Engage 6');
    expect(currentStep(state()).poses.A.joints).not.toEqual(a.joints);
  });

  it('does nothing when the blades are too far apart to beat or engage, even in new-step mode', () => {
    state().toggleActionsNewStep();
    const before = state().combination;
    expect(state().act({ kind: 'beat', line: 'quarte' })).toEqual({ short: 0, close: false, apart: true });
    expect(state().combination).toBe(before);
    expect(state().past).toHaveLength(0);
  });

  it('reports how far short a hit falls, without highlighting it', () => {
    const { short } = state().act({ kind: 'hit', area: 'body', with: 'arm' });
    expect(short).toBeGreaterThan(0);
    expect(currentStep(state()).display?.targets ?? []).toEqual([]);
  });

  it('never adds a step or a label for a distance', () => {
    newStepMode(true);
    state().act({ kind: 'distance', measure: 'medium' });
    expect(state().combination.steps).toHaveLength(1);
    expect(labels()).toEqual(['En garde']);
    expect(state().change.label).toBe('Step 1 · A: Medium distance');
    newStepMode(false);
  });

  it('sends the path under the blade, and straightens it again', () => {
    state().shapeActivePath('under');
    expect(state().past).toHaveLength(0);
    state().act({ kind: 'distance', measure: 'medium' });
    state().addStep();
    state().act({ kind: 'footwork', move: 'lunge' });
    state().shapeActivePath('under');
    expect(currentStep(state()).pins?.A).toHaveLength(1);
    state().shapeActivePath('direct');
    expect(currentStep(state()).pins).toBeUndefined();
  });
});

describe('the working view and what students see', () => {
  const here = { position: [1, 2, 3], target: [0, 1, 0] } as const;
  const there = { position: [4, 2, -3], target: [1, 1, 0] } as const;
  const look = (v: typeof here | typeof there) => state().setView({ position: [...v.position], target: [...v.target] });

  it('never changes a step by looking around', () => {
    const before = state().combination;
    look(here);
    look(there);
    expect(state().combination).toBe(before);
    expect(hasShot(currentStep(state()))).toBe(false);
  });

  it('uses the working view for students only when asked, as one undo step', () => {
    look(here);
    expect(viewIsShot(state())).toBe(false);
    state().setShot();
    expect(currentStep(state()).camera).toEqual(here);
    expect(viewIsShot(state())).toBe(true);
    look(there);
    expect(currentStep(state()).camera).toEqual(here);
    expect(viewIsShot(state())).toBe(false);
    state().undo();
    expect(hasShot(currentStep(state()))).toBe(false);
  });

  it('sets and clears every step at once with one view for all', () => {
    state().addStep();
    state().toggleSharedView();
    look(there);
    state().setShot();
    expect(state().combination.steps.map((s) => s.camera)).toEqual([there, there]);
    state().clearShot();
    expect(state().combination.steps.some(hasShot)).toBe(false);
  });

  it('keeps the working view when moving between steps, and can fly to the step’s shot', () => {
    look(here);
    state().setShot();
    state().addStep();
    look(there);
    const flights = state().flight?.id ?? 0;
    state().goToStep(0);
    expect(state().flight?.id ?? 0).toBe(flights);
    state().showShot();
    expect(state().flight?.camera).toEqual(here);
  });

  it('goes back to the working view when playing stops', () => {
    state().addStep();
    look(there);
    state().startPreview();
    state().stopPreview();
    expect(state().flight?.camera).toEqual(there);
  });
});

describe('more from poses', () => {
  const lunge = BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!;
  const parry4 = BUILT_IN_PRESETS.find((p) => p.id === 'parry-4')!;
  const changed = (a: Pose, b: Pose) => JOINT_NAMES.filter((n) => JSON.stringify(a.joints[n] ?? {}) !== JSON.stringify(b.joints[n] ?? {}));

  it('applies a pose to the weapon arm alone, on the right side for a left-hander too', () => {
    const before = pose();
    state().applyPreset(parry4, 'arm');
    expect(changed(before, pose()).sort()).toEqual(['elbow_r', 'shoulder_r', 'wrist_r']);
    state().setSetup({ handedness: 'left' });
    state().applyPreset(enGarde, 'all');
    const left = pose();
    state().applyPreset(parry4, 'arm');
    expect(changed(left, pose()).sort()).toEqual(['elbow_l', 'shoulder_l', 'wrist_l']);
  });

  it('dials a pose back: halfway is halfway, and the click with all its dialling is one undo step', () => {
    const before = pose();
    state().applyPreset(lunge);
    const full = pose();
    expect(poseDial(state())).toEqual({ name: 'Lunge', amount: 1 });
    state().setPoseAmount(0.5);
    expect(angle(pose(), 'knee_r', 'flex')).toBeCloseTo((angle(before, 'knee_r', 'flex') + angle(full, 'knee_r', 'flex')) / 2, 6);
    expect(pose().root.x).toBe(before.root.x);
    state().setPoseAmount(0.25);
    state().setPoseAmount(1);
    expect(pose()).toEqual(full);
    state().setPoseAmount(0);
    expect(pose()).toEqual(before);
    expect(state().past).toHaveLength(1);
    state().setPoseAmount(0.5);
    state().undo();
    expect(pose()).toEqual(before);
    expect(state().past).toHaveLength(0);
  });

  it('stops offering the dial once anything else moves either fencer', () => {
    state().applyPreset(lunge);
    state().setAngle('knee_l', 'flex', 20);
    expect(poseDial(state())).toBeNull();
    const now = pose();
    state().setPoseAmount(0.5);
    expect(pose()).toBe(now);

    state().applyPreset(lunge);
    state().setActive('B');
    state().setAngle('knee_l', 'flex', 20);
    state().setActive('A');
    expect(poseDial(state())).toBeNull();

    state().applyPreset(lunge);
    state().addStep();
    expect(poseDial(state())).toBeNull();
  });

  it('leaves the other fencer’s blade as it was after dialling there and back', () => {
    state().act({ kind: 'distance', measure: 'short' });
    const other = currentStep(state()).poses.B;
    state().applyPreset(BUILT_IN_PRESETS.find((p) => p.id === 'extension')!);
    for (const k of [0.8, 0.3, 0.6, 0]) state().setPoseAmount(k);
    expect(currentStep(state()).poses.B).toEqual(other);
  });

  it('takes a pose from another step, keeping where the fencer stands', () => {
    state().addStep();
    state().applyPreset(lunge);
    state().setPosition(-1);
    const lunged = pose();
    state().goToStep(0);
    const here = pose().root.x;
    state().applyStepPose(1);
    expect(pose().joints).toEqual(lunged.joints);
    expect(pose().root.x).toBe(here);
    expect(state().change.label).toBe('Step 1 · A: Pose from step 2');
    // And it can be dialled like any pose.
    expect(poseDial(state())?.name).toBe('Pose from step 2');
  });

  it('takes the other fencer’s pose, and does nothing when asked for the pose already there', () => {
    state().setActive('B');
    state().applyPreset(lunge);
    state().setActive('A');
    const b = currentStep(state()).poses.B;
    state().applyStepPose(0, 'B');
    expect(pose().joints).toEqual(b.joints);
    const edits = state().past.length;
    state().applyStepPose(0);
    expect(state().past).toHaveLength(edits);
  });
});

describe('review round 1: the pose dial, labels and actions that change nothing', () => {
  const lunge = BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!;
  const poses = () => currentStep(state()).poses;

  it('never dials the other fencer: the dial hides when they are selected and comes back with its own', () => {
    const before = poses();
    state().applyPreset(lunge);
    const lunged = poses();
    state().setActive('B');
    expect(poseDial(state())).toBeNull();
    state().setPoseAmount(0.5);
    expect(poses()).toBe(lunged);
    expect(poses().B).toBe(before.B);
    state().setActive('A');
    expect(poseDial(state())).toEqual({ name: 'Lunge', amount: 1 });
    state().setPoseAmount(0.5);
    expect(poses().B).toEqual(before.B);
    expect(state().change.label).toBe('Step 1 · A: Lunge 50%');
  });

  it('ends the dial after anything else, so a click and its dialling are always one undo step', () => {
    const others: [string, () => void][] = [
      ['another step and back', () => (state().goToStep(1), state().goToStep(0))],
      ['undo then redo', () => (state().undo(), state().redo())],
      ['a label', () => state().setStepText({ label: 'x' })],
      ['what is shown', () => state().setDisplay({ distance: true })],
      ['the students’ view', () => (state().setView({ position: [1, 2, 3], target: [0, 1, 0] }), state().setShot())],
    ];
    for (const [, between] of others) {
      useEditor.setState(initial, true);
      state().addStep();
      state().goToStep(0);
      state().applyPreset(lunge);
      const lunged = pose();
      const entries = state().past.length;
      between();
      expect(poseDial(state())).toBeNull();
      state().setPoseAmount(0.5);
      expect(pose()).toEqual(lunged);
      expect(state().past.length - entries).toBeLessThanOrEqual(1);
    }
  });

  it('adds nothing to history when the dial is set to where it already is', () => {
    state().applyPreset(lunge);
    const entries = state().past.length;
    const now = state().combination;
    state().setPoseAmount(1);
    expect(state().combination).toBe(now);
    expect(state().past).toHaveLength(entries);
  });

  it('leaves alone any label that is not made only of the names actions write', () => {
    for (const typed of ['A: feint low', 'A: feint to hand, then disengage', 'A: Lunge (long)', 'B: Parry 5', 'Feint', 'A: Lunge · watch the hand']) {
      useEditor.setState(initial, true);
      state().setStepText({ label: typed });
      state().act({ kind: 'extend' });
      expect(currentStep(state()).label).toBe(typed);
    }
    // A label made only of such names is still extended, even after the coach corrected one of them.
    useEditor.setState(initial, true);
    state().act({ kind: 'parry', number: 6 });
    state().setStepText({ label: 'A: Parry 4' });
    state().setActive('B');
    state().act({ kind: 'footwork', move: 'lunge' });
    expect(currentStep(state()).label).toBe('A: Parry 4 · B: Lunge');
  });

  it('does nothing for an action that changes nothing on a step the coach named', () => {
    state().act({ kind: 'footwork', move: 'recover' });
    state().setStepText({ label: 'Back on guard' });
    const entries = state().past.length;
    const now = state().combination;
    state().act({ kind: 'footwork', move: 'recover' });
    expect(state().combination).toBe(now);
    expect(state().past).toHaveLength(entries);
    // In new-step mode the step is still added: the coach asked for one.
    state().toggleActionsNewStep();
    state().act({ kind: 'footwork', move: 'recover' });
    expect(state().combination.steps).toHaveLength(2);
  });
});

describe('review round 1: kept things win over keys, typed angles, Straighten and steps', () => {
  const lunge = BUILT_IN_PRESETS.find((p) => p.id === 'lunge')!;
  const extension = BUILT_IN_PRESETS.find((p) => p.id === 'extension')!;
  const rigA = () => solveRig(state().combination.fencers.A, pose(), 0);
  const at = (j: 'ankle_l' | 'ankle_r' | 'wrist_r') => jointPosition(rigA(), j);
  const feetMoved = (from: { l: Vector3; r: Vector3 }) => Math.max(at('ankle_l').distanceTo(from.l), at('ankle_r').distanceTo(from.r));
  const feet = () => ({ l: at('ankle_l'), r: at('ankle_r') });

  it('stops a typed pelvis turn short rather than let a kept foot slip, and says so', () => {
    state().applyPreset(lunge);
    const before = feet();
    const turn = angle(pose(), 'pelvis', 'turn');
    state().setAngle('pelvis', 'turn', turn + 20);
    expect(feetMoved(before)).toBeLessThan(0.015);
    expect(angle(pose(), 'pelvis', 'turn')).toBeLessThan(turn + 20);
    expect(state().heldBack).toMatch(/A’s feet are kept in place/);
    // An edit that is not held back clears the message.
    state().setAngle('neck', 'turn', 10);
    expect(state().heldBack).toBeNull();
  });

  it('cannot walk a kept foot away with a held key, a slider, or R pressed again and again', () => {
    state().applyPreset(lunge);
    const before = feet();
    state().select('pelvis');
    for (let i = 0; i < 40; i++) state().nudge(0, 2);
    expect(feetMoved(before)).toBeLessThanOrEqual(0.0201);
    const turn = angle(pose(), 'pelvis', 'turn');
    for (let i = 1; i <= 30; i++) state().setAngle('pelvis', 'turn', turn + i);
    expect(feetMoved(before)).toBeLessThanOrEqual(0.0201);
    for (let i = 0; i < 25; i++) state().resetJoint('pelvis');
    expect(feetMoved(before)).toBeLessThanOrEqual(0.0201);
  });

  it('keeps kept feet when the pelvis is straightened, and leaves a leg the coach straightens alone', () => {
    const before = feet();
    state().resetJoint('pelvis');
    expect(feetMoved(before)).toBeLessThan(0.015);
    // A leg the coach straightens is theirs to move: its own foot is not kept, the other is.
    const flex = angle(pose(), 'knee_r', 'flex');
    state().setAngle('knee_r', 'flex', flex - 10);
    expect(angle(pose(), 'knee_r', 'flex')).toBe(flex - 10);
    expect(at('ankle_r').distanceTo(before.r)).toBeGreaterThan(0.02);
    expect(at('ankle_l').distanceTo(before.l)).toBeLessThan(0.015);
    // Straightened all the way, the longer leg would lift the body off the kept foot: it stops short and says so.
    state().resetJoint('knee_r');
    expect(at('ankle_l').distanceTo(before.l)).toBeLessThan(0.021);
    expect(angle(pose(), 'knee_r', 'flex') === 0 || !!state().heldBack).toBe(true);
  });

  it('places a foot afresh after the coach moves it directly, instead of pulling it back', () => {
    const start = feet();
    state().setAngle('pelvis', 'lean', 5);
    // A small direct edit of the right leg: under the allowance, but deliberate.
    state().setAngle('knee_r', 'flex', angle(pose(), 'knee_r', 'flex') + 2);
    const placed = at('ankle_r');
    expect(placed.distanceTo(start.r)).toBeGreaterThan(0.001);
    state().setAngle('neck', 'turn', 20);
    expect(at('ankle_r').distanceTo(placed)).toBeLessThan(0.001);
  });

  it('steps the feet with the fencer while a kept hand stays, however many steps', () => {
    state().toggleKeep('hand');
    const hand = at('wrist_r');
    const before = feet();
    for (let i = 0; i < 6; i++) state().advance(0.01);
    expect(at('ankle_l').x - before.l.x).toBeCloseTo(0.06, 2);
    expect(at('wrist_r').distanceTo(hand)).toBeLessThan(0.015);
    // Then far further than the arm is long: the step is cut short, the hand stays.
    for (let i = 0; i < 12; i++) state().advance(0.25);
    expect(at('wrist_r').distanceTo(hand)).toBeLessThan(0.015);
    expect(state().heldBack).toMatch(/hand is kept in place/);
    state().toggleKeep('hand');
  });

  it('keeps a kept hand through a hips drag with a straight arm', () => {
    state().applyPreset(extension);
    const from = pose();
    const setup = state().combination.fencers.A;
    const r0 = solveRig(setup, from, 0);
    const hand = jointPosition(r0, 'wrist_r');
    for (const d of [0.02, 0.06, 0.08, 0.1, 0.12, 0.3, 0.6]) {
      const p = dragDot(from, setup, 0, 'hips', jointPosition(r0, 'pelvis').add(new Vector3(d, 0, 0)), { feet: true, hand: true, point: false });
      expect(jointPosition(solveRig(setup, p, 0), 'wrist_r').distanceTo(hand)).toBeLessThan(0.015);
    }
    // Pulled back further than the arm is long, the hips stop where the hand can still be kept.
    const far = dragDot(from, setup, 0, 'hips', jointPosition(r0, 'pelvis').add(new Vector3(-0.8, 0, 0)), { feet: false, hand: true, point: false });
    expect(jointPosition(solveRig(setup, far, 0), 'wrist_r').distanceTo(hand)).toBeLessThan(0.015);
  });
});

describe('review round 2: one memory of kept places per fencer, shared by keys and drags', () => {
  const preset = (id: string) => BUILT_IN_PRESETS.find((p) => p.id === id)!;
  const rigOf = (f: 'A' | 'B' = state().active) => solveRig(state().combination.fencers[f], currentStep(state()).poses[f], HEADING[f]);
  const at = (j: 'ankle_l' | 'ankle_r' | 'wrist_r' | 'pelvis' | 'knee_r', f: 'A' | 'B' = 'A') => jointPosition(rigOf(f), j);
  let dragIds = 5000;
  /** One whole drag of a dot, as the sketch and the 3D handles make it: places fixed at pointer-down, then the pointer moves. */
  const drag = (dot: Dot, by: [number, number, number], moves = 3) => {
    const s = state();
    const f = s.active;
    const setup = s.combination.fencers[f];
    const from = currentStep(s).poses[f];
    const spots = s.spotsFor(f, keptInDrag(setup, s.keep, dot));
    const start = dotPositions(solveRig(setup, from, HEADING[f]))[dot];
    const id = ++dragIds;
    for (let i = 1; i <= moves; i++) {
      const target = start.clone().add(new Vector3(...by).multiplyScalar(i / moves));
      const r = dragDotKept(from, setup, HEADING[f], dot, target, state().keep, spots);
      state().dragPose(r.pose, id, { fencer: f, stepId: currentStep(state()).id, pose: from, spots, cut: r.cut });
    }
  };
  const slide = (dx: number) => {
    const s = state();
    const f = s.active;
    const from = currentStep(s).poses[f];
    const spots = s.spotsFor(f, keptInSlide(s.keep));
    const r = slideFencer(from, s.combination.fencers[f], HEADING[f], from.root.x + dx, from.root.z, s.keep, spots);
    s.dragPose(r.pose, ++dragIds, { fencer: f, stepId: currentStep(s).id, pose: from, spots, cut: r.cut });
  };

  it('keeps A’s feet however the coach alternates between the fencers (R2-1)', () => {
    const feet = [at('ankle_r'), at('ankle_l')];
    for (let i = 0; i < 25; i++) {
      state().setAngle('pelvis', 'turn', angle(pose(), 'pelvis', 'turn') - 2);
      state().setActive('B');
      state().setAngle('neck', 'turn', i);
      state().setActive('A');
    }
    expect(Math.max(at('ankle_r').distanceTo(feet[0]), at('ankle_l').distanceTo(feet[1]))).toBeLessThanOrEqual(0.0201);
  });

  it('keeps the feet of each step however the coach goes back and forth between steps (R3-A)', () => {
    state().addStep();
    state().goToStep(0);
    const feet = [at('ankle_r'), at('ankle_l')];
    for (let i = 0; i < 25; i++) {
      state().setAngle('pelvis', 'turn', angle(pose(), 'pelvis', 'turn') - 2);
      state().goToStep(1);
      state().setAngle('neck', 'turn', i);
      drag('hips', [0.02, 0, 0]);
      state().goToStep(0);
    }
    expect(Math.max(at('ankle_r').distanceTo(feet[0]), at('ankle_l').distanceTo(feet[1]))).toBeLessThanOrEqual(0.0201);
    // And undo brings back each pose with its own memory: redoing the run does not drift either.
    for (let i = 0; i < 10; i++) state().undo();
    for (let i = 0; i < 10; i++) state().redo();
    state().goToStep(0);
    for (let i = 0; i < 10; i++) state().setAngle('pelvis', 'turn', angle(pose(), 'pelvis', 'turn') - 2);
    expect(Math.max(at('ankle_r').distanceTo(feet[0]), at('ankle_l').distanceTo(feet[1]))).toBeLessThanOrEqual(0.0201);
  });

  it('keeps a kept hand through any number of separate drags, of the hips or of the floor marker (R2-2)', () => {
    for (const how of ['hips', 'floor'] as const) {
      useEditor.setState(initial, true);
      state().applyPreset(preset('extension'));
      state().toggleKeep('feet');
      state().toggleKeep('hand');
      const hand = at('wrist_r');
      for (let i = 0; i < 15; i++) how === 'hips' ? drag('hips', [-0.1, 0, 0]) : slide(-0.1);
      expect(at('wrist_r').distanceTo(hand)).toBeLessThanOrEqual(0.0201);
      state().toggleKeep('feet');
      state().toggleKeep('hand');
    }
  });

  it('keeps the feet through runs of drags and keys mixed together', () => {
    state().applyPreset(preset('lunge'));
    const feet = [at('ankle_r'), at('ankle_l')];
    for (let i = 0; i < 12; i++) {
      drag('hips', [0.12, 0.05, 0]);
      state().setAngle('pelvis', 'turn', angle(pose(), 'pelvis', 'turn') + 3);
      drag('chest', [0.1, 0, 0]);
      // Typing the angle a joint already has commits nothing, and must not lose the memory either.
      state().setAngle('neck', 'turn', angle(pose(), 'neck', 'turn'));
    }
    expect(Math.max(at('ankle_r').distanceTo(feet[0]), at('ankle_l').distanceTo(feet[1]))).toBeLessThanOrEqual(0.0201);
  });

  it('never moves a knee’s own kept foot, or the other foot, however far a dot is dragged (G1)', () => {
    for (const start of ['en-garde', 'lunge']) {
      for (const [dot, by] of [['knee_r', [-0.35, 0, 0]], ['knee_r', [0, 0, 0.35]], ['knee_l', [-0.35, 0, 0]], ['knee_l', [0, 0, 0.35]]] as [Dot, [number, number, number]][]) {
        useEditor.setState(initial, true);
        state().applyPreset(preset(start));
        const feet = [at('ankle_r'), at('ankle_l')];
        drag(dot, by);
        expect(Math.max(at('ankle_r').distanceTo(feet[0]), at('ankle_l').distanceTo(feet[1])), `${start} ${dot} ${by}`).toBeLessThanOrEqual(0.0201);
      }
    }
    // In a lunge, the back foot dragged forward: the front foot stays.
    useEditor.setState(initial, true);
    state().applyPreset(preset('lunge'));
    const front = at('ankle_r');
    drag('foot_l', [0.35, 0, 0]);
    expect(at('ankle_r').distanceTo(front)).toBeLessThanOrEqual(0.0201);
    // And a small knee drag still does what it is for.
    useEditor.setState(initial, true);
    const knee = at('knee_r');
    drag('knee_r', [0, 0, 0.05]);
    expect(at('knee_r').distanceTo(knee)).toBeGreaterThan(0.01);
  });

  it('does not pull back a hand the coach dragged while the point was kept, nor a blade turned while the hand was kept', () => {
    state().toggleKeep('point');
    state().setAngle('pelvis', 'lean', 3);
    drag('hand_r', [0.1, 0.05, 0]);
    const hand = at('wrist_r');
    state().setAngle('pelvis', 'lean', 5);
    expect(at('wrist_r').distanceTo(hand)).toBeLessThan(0.03);
    state().toggleKeep('point');

    state().toggleKeep('hand');
    drag('point', [0, 0.15, 0.1]);
    const blade = rigOf().tip.clone().sub(rigOf().guard).normalize();
    state().setAngle('pelvis', 'lean', 8);
    expect(rigOf().tip.clone().sub(rigOf().guard).normalize().dot(blade)).toBeGreaterThan(0.99);
    state().toggleKeep('hand');
  });

  it('forgets a fencer’s kept places when their build changes, so a later key does not re-bend the legs (U1)', () => {
    state().select('pelvis');
    state().nudge(0, 2);
    state().setSetup({ build: 1.15 }, 'A');
    const before = pose();
    state().select('neck');
    state().nudge(0, 2);
    for (const j of ['hip_r', 'knee_r', 'ankle_r', 'hip_l', 'knee_l', 'ankle_l'] as const) expect(pose().joints[j]).toEqual(before.joints[j]);
  });

  it('clears the “held back” line when the fencer or the step changes, however that happens (U2)', () => {
    const hold = () => {
      useEditor.setState(initial, true);
      state().applyPreset(preset('lunge'));
      state().setAngle('pelvis', 'turn', angle(pose(), 'pelvis', 'turn') + 20);
      expect(state().heldBack).not.toBeNull();
    };
    for (const change of [
      () => state().addStep(),
      () => state().setActive('B'),
      () => state().select('neck', 'B'),
      () => state().setSetup({ build: 1.1 }, 'A'),
      () => (state().addStep(), state().goToStep(0), state().deleteStep()),
    ]) {
      hold();
      change();
      expect(state().heldBack).toBeNull();
    }
  });

  it('ends a drag when another fencer is selected, the step changes, or something else edits the fencer mid-drag (U3)', () => {
    const begin = () => {
      const s = state();
      const from = currentStep(s).poses.A;
      const setup = s.combination.fencers.A;
      const start = at('wrist_r');
      const id = ++dragIds;
      const move = (dx: number) => {
        const r = dragDotKept(from, setup, 0, 'hand_r', start.clone().add(new Vector3(dx, 0, 0)), state().keep, {});
        state().dragPose(r.pose, id, { fencer: 'A', stepId: currentStep(s).id, pose: from, spots: {}, cut: r.cut });
      };
      return move;
    };
    // F pressed mid-drag.
    let move = begin();
    move(0.05);
    const b = currentStep(state()).poses.B;
    state().setActive('B');
    move(0.1);
    expect(currentStep(state()).poses.B).toBe(b);
    state().setActive('A');
    // A key pressed mid-drag: the key's edit stands, the rest of the drag is ignored.
    move = begin();
    move(0.05);
    state().advance(0.05);
    const stepped = pose();
    move(0.1);
    expect(pose()).toBe(stepped);
    // Another step mid-drag.
    move = begin();
    move(0.05);
    state().addStep();
    const copy = pose();
    move(0.1);
    expect(pose()).toBe(copy);
  });
});
