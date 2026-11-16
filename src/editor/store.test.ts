import { beforeEach, describe, expect, it } from 'vitest';
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
