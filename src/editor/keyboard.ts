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

      if (key === 'Tab') {
        // Tab still walks the panel's controls when one of them has focus.
        if (e.target instanceof HTMLElement && e.target.closest('.panel')) return;
        e.preventDefault();
        s.selectNext(e.shiftKey ? -1 : 1);
        return;
      }
      if (key === 'Escape') return s.select(null);
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
    // Show which modifiers are held, so Shift and Alt are never a secret.
    const onModifiers = (e: KeyboardEvent) => useEditor.getState().setHeld({ shift: e.shiftKey, alt: e.altKey });
    const release = () => useEditor.getState().setHeld({ shift: false, alt: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onModifiers);
    window.addEventListener('keyup', onModifiers);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onModifiers);
      window.removeEventListener('keyup', onModifiers);
      window.removeEventListener('blur', release);
    };
  }, []);
}
