import { useEffect } from 'react';
import { useEditor } from './store.ts';

/** Keys that nudge the selected joint: [decrease, increase] for its 1st, 2nd and 3rd movement. */
export const NUDGE_KEYS: [string[], string[]][] = [
  [['a', 'ArrowLeft'], ['d', 'ArrowRight']],
  [['s', 'ArrowDown'], ['w', 'ArrowUp']],
  [['q'], ['e']],
];

export const NUDGE_LABELS = ['A / D', 'S / W', 'Q / E'];

export const STEP = { normal: 2, big: 10, fine: 0.5 };

/** Metres per press of [ or ]. */
export const MOVE = { normal: 0.05, big: 0.25, fine: 0.01 };

function typingInto(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    // A focused slider keeps its own arrow keys; letters still pose.
    return target.type !== 'range' || key.startsWith('Arrow');
  }
  return false;
}

export function useKeyboardPosing() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingInto(e.target, e.key)) return;
      if (e.key === 'Alt') e.preventDefault();
      const s = useEditor.getState();
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod) return;

      // Space stops playback at once. Otherwise holding it and dragging slides
      // the view (as in drawing apps); a tap without a drag plays on release.
      if (key === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        if (s.preview) return s.stopPreview();
        space = { dragged: false };
        s.setPanning(true);
        return;
      }
      if (s.preview) {
        if (!['Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) s.stopPreview();
        return;
      }

      if (key === 'Tab') {
        // Tab still walks the panel's controls when one of them has focus.
        if (e.target instanceof HTMLElement && e.target.closest('.panel')) return;
        e.preventDefault();
        s.selectNext(e.shiftKey ? -1 : 1);
        return;
      }
      if (key === 'Escape') return s.pathEdit ? s.exitPath() : s.select(null);
      if (key === 'x') return s.selectOpposite();
      if (key === 'r' && s.selected) return s.resetJoint(s.selected);
      if (key === 'f') return s.setActive(s.active === 'A' ? 'B' : 'A');
      if (key === 'n') return s.addStep();
      if (key === 'h') return s.toggleHandles();
      if (key === 'l') return s.toggleCameraLock();
      if (key === 'z') return s.requestFit(e.shiftKey ? s.active : 'both');
      if (key === ',' || key === '<') return s.goToStep(s.stepIndex - 1);
      if (key === '.' || key === '>') return s.goToStep(s.stepIndex + 1);
      if (key === '[' || key === ']' || key === '{' || key === '}') {
        e.preventDefault();
        const metres = e.shiftKey ? MOVE.big : e.altKey ? MOVE.fine : MOVE.normal;
        return s.advance(key === ']' || key === '}' ? metres : -metres);
      }

      const step = e.shiftKey ? STEP.big : e.altKey ? STEP.fine : STEP.normal;
      NUDGE_KEYS.forEach(([down, up], i) => {
        if (down.includes(key) || up.includes(key)) {
          e.preventDefault();
          s.nudge(i, up.includes(key) ? step : -step);
        }
      });
    };
    let space: { dragged: boolean } | null = null;
    const onSpaceUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !space) return;
      e.preventDefault();
      const tapped = !space.dragged;
      space = null;
      const s = useEditor.getState();
      s.setPanning(false);
      if (tapped && !s.preview) s.startPreview();
    };
    const onPointerDown = () => {
      if (space) space.dragged = true;
    };
    // Show which modifiers are held, so Shift and Alt are never a secret.
    const onModifiers = (e: KeyboardEvent) => useEditor.getState().setHeld({ shift: e.shiftKey, alt: e.altKey });
    const release = () => {
      space = null;
      useEditor.getState().setHeld({ shift: false, alt: false });
      useEditor.getState().setPanning(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onModifiers);
    window.addEventListener('keyup', onModifiers);
    window.addEventListener('keyup', onSpaceUp);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onModifiers);
      window.removeEventListener('keyup', onModifiers);
      window.removeEventListener('keyup', onSpaceUp);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', release);
    };
  }, []);
}
