import { create } from 'zustand';
import type { StepCamera } from '../model/combination.ts';
import { useEditor } from './store.ts';

// What is on screen, as opposed to what is in the combination (store.ts).
// The rule the layout follows: what is selected decides which tools show.
//   - on the desk:      the list of combinations, nothing else
//   - nothing selected: the steps, Play and the view buttons
//   - a fencer picked:  that fencer's tray (actions, poses, keep still) and drag handles
//   - a joint selected: its controls beside it (JointHud)

const IN_EDITOR = 'fencing-poser.in-editor';

function wasInEditor(): boolean {
  try {
    return sessionStorage.getItem(IN_EDITOR) === 'yes';
  } catch {
    return false;
  }
}

function rememberInEditor(yes: boolean) {
  try {
    if (yes) sessionStorage.setItem(IN_EDITOR, 'yes');
    else sessionStorage.removeItem(IN_EDITOR);
  } catch {
    // Only a convenience: a reload may open on the desk.
  }
}

/** The part of the window the 3D view may use: the rest is under a panel. In CSS pixels from the top left. */
export interface Clear {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UiState {
  /** The opening view: the desk, with the combinations to choose from. A reload while working stays in the editor. */
  desk: boolean;
  /** A fencer is being posed: their tray and drag handles show. */
  posing: boolean;
  /** Where the camera was while working, to return to from the desk. */
  workView: StepCamera | null;
  clear: Clear | null;
  goToDesk: () => void;
  leaveDesk: () => void;
  setPosing: (posing: boolean) => void;
  setClear: (clear: Clear | null) => void;
}

export const useUi = create<UiState>((set, get) => ({
  desk: !wasInEditor(),
  posing: false,
  workView: null,
  clear: null,
  goToDesk: () => {
    const s = useEditor.getState();
    if (s.preview) s.stopPreview();
    if (s.pathEdit) s.exitPath();
    s.select(null);
    rememberInEditor(false);
    set({ desk: true, posing: false, workView: s.view });
  },
  leaveDesk: () => {
    rememberInEditor(true);
    // A new combination is one step, waiting to be posed; a longer one is opened to look at first.
    set({ desk: false, posing: useEditor.getState().combination.steps.length < 2 });
  },
  setPosing: (posing) => {
    if (posing === get().posing) return;
    if (!posing) useEditor.getState().select(null);
    set({ posing });
  },
  setClear: (clear) => set({ clear }),
}));

// Touching a fencer in any way (selecting a joint, switching fencer, dragging a
// dot in the sketch) means posing them.
useEditor.subscribe((s, prev) => {
  if (useUi.getState().desk) return;
  const touched = (s.selected && s.selected !== prev.selected) || s.active !== prev.active;
  const dragged = s.lastEdit !== prev.lastEdit && s.lastEdit?.key.startsWith('drag');
  if (touched || dragged) useUi.setState({ posing: true });
});

// Dev only: lets a test browser drive the screen (window.__ui.getState()).
if (import.meta.env.DEV) Object.assign(window, { __ui: useUi });
