import { beforeEach, describe, expect, it } from 'vitest';
import { START_X } from '../model/combination.ts';
import { mirrorPose } from '../model/mirror.ts';
import { angle } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { activePose, currentStep, useEditor } from './store.ts';

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
