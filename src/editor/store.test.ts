import { beforeEach, describe, expect, it } from 'vitest';
import { mirrorPose } from '../model/mirror.ts';
import { angle } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { useEditor } from './store.ts';

const initial = useEditor.getState();
const enGarde = BUILT_IN_PRESETS.find((p) => p.id === 'en-garde')!;

beforeEach(() => useEditor.setState(initial, true));

describe('undo', () => {
  it('undoes a held key as one step, and redoes it', () => {
    const s = useEditor.getState();
    s.select('elbow_r');
    const before = angle(s.pose, 'elbow_r', 'flex');
    for (let i = 0; i < 5; i++) useEditor.getState().nudge(0, 2);
    expect(angle(useEditor.getState().pose, 'elbow_r', 'flex')).toBe(before + 10);
    useEditor.getState().undo();
    expect(angle(useEditor.getState().pose, 'elbow_r', 'flex')).toBe(before);
    useEditor.getState().redo();
    expect(angle(useEditor.getState().pose, 'elbow_r', 'flex')).toBe(before + 10);
  });

  it('keeps different joints as separate steps', () => {
    const s = useEditor.getState();
    s.setAngle('knee_r', 'flex', 90);
    useEditor.getState().setAngle('knee_l', 'flex', 90);
    useEditor.getState().undo();
    expect(angle(useEditor.getState().pose, 'knee_r', 'flex')).toBe(90);
    expect(angle(useEditor.getState().pose, 'knee_l', 'flex')).not.toBe(90);
  });

  it('stays inside joint limits when nudged past them', () => {
    useEditor.getState().select('knee_r');
    for (let i = 0; i < 40; i++) useEditor.getState().nudge(0, 10);
    expect(angle(useEditor.getState().pose, 'knee_r', 'flex')).toBe(150);
  });
});

describe('presets', () => {
  it('stores a pose made on a left-hander as right-handed', () => {
    useEditor.getState().setSetup({ handedness: 'left' });
    useEditor.getState().saveCurrentAsPreset('Mine');
    const mine = useEditor.getState().presets.find((p) => p.name === 'Mine')!;
    expect(mine.builtIn).toBe(false);
    expect(mine.pose.joints).toEqual(enGarde.pose.joints);
  });

  it('edits a built-in in place and restores the original', () => {
    useEditor.getState().setAngle('elbow_r', 'flex', 20);
    useEditor.getState().updatePreset('en-garde');
    let shown = useEditor.getState().presets.find((p) => p.id === 'en-garde')!;
    expect(shown.modified).toBe(true);
    expect(angle(shown.pose, 'elbow_r', 'flex')).toBe(20);

    useEditor.getState().removePreset('en-garde');
    shown = useEditor.getState().presets.find((p) => p.id === 'en-garde')!;
    expect(shown.modified).toBe(false);
    expect(shown.pose).toEqual(enGarde.pose);
  });

  it('applies a preset mirrored to a left-hander, keeping where they stand', () => {
    useEditor.setState({ pose: { ...useEditor.getState().pose, root: { x: 1.5, z: 0.2, lift: 0 } } });
    useEditor.getState().setSetup({ handedness: 'left' });
    useEditor.getState().applyPreset(enGarde);
    const { pose } = useEditor.getState();
    expect(pose.joints).toEqual(mirrorPose(enGarde.pose).joints);
    expect(pose.root.x).toBe(1.5);
  });
});
