import { useEffect, useRef, useState, type RefObject } from 'react';
import { FENCERS, isShaped } from '../model/combination.ts';
import { formatDistance } from '../model/units.ts';
import { measure } from '../scene/measure.ts';
import { SketchPane } from '../sketch/SketchPane.tsx';
import { PlayIcon } from '../ui/Icon.tsx';
import { Desk } from './Desk.tsx';
import { useKeyboardPosing } from './keyboard.ts';
import { LibraryDialog } from './LibraryDialog.tsx';
import { ShareDialog } from './ShareDialog.tsx';
import { Stage } from './Stage.tsx';
import { Storyboard } from './Storyboard.tsx';
import { currentStep, useEditor } from './store.ts';
import { TopBar } from './TopBar.tsx';
import { hasToured, Tour } from './Tour.tsx';
import { Tray } from './Tray.tsx';
import { useUi } from './ui.ts';
import { lookAt } from './views.ts';

/**
 * The whole editor. The 3D view fills the window; over it lie, from the top:
 * the bar with the title and the view buttons, the tray of the fencer being
 * posed (only while one is), the sketch (when open) and the storyboard.
 * On the desk, none of that shows: only the combinations to choose from.
 */
export function Editor() {
  const [dialog, setDialog] = useState<'library' | 'share' | null>(null);
  const [touring, setTouring] = useState(false);
  const desk = useUi((u) => u.desk);
  const posing = useUi((u) => u.posing);
  const sketchOpen = useEditor((s) => s.sketch.open);
  const playing = useEditor((s) => !!s.preview);
  const shaping = useEditor((s) => s.pathEdit && s.stepIndex > 0);
  const loaded = useEditor((s) => s.loaded);
  const clear = useRef<HTMLDivElement>(null);
  useKeyboardPosing();
  useScreenKeys();
  useClear(clear, desk);
  useEffect(() => {
    void useEditor.getState().start();
  }, []);

  // The camera glides out to the desk and back in to where the work was.
  const measured = useUi((u) => !!u.clear);
  useEffect(() => {
    if (!measured || !loaded) return;
    const ui = useUi.getState();
    useEditor.getState().requestView(desk ? lookAt('desk') : (ui.workView ?? lookAt('work')));
    if (!desk && !hasToured()) setTouring(true);
  }, [desk, measured, loaded]);

  const tray = posing && !playing && !shaping;
  return (
    <div className="app">
      <div className="world">
        <Stage />
      </div>
      <div className="vignette" aria-hidden />
      {desk ? (
        <Desk clear={clear} onManage={() => setDialog('library')} />
      ) : (
        <div className={`chrome${tray ? ' has-tray' : ''}`}>
          <TopBar onShare={() => setDialog('share')} onLibrary={() => setDialog('library')} onTour={() => setTouring(true)} />
          {tray && <Tray />}
          <div className="clear" ref={clear}>
            <Readouts />
            {shaping && <PathBanner />}
            <Prompt posing={posing} />
          </div>
          {sketchOpen && <SketchPane />}
          <Storyboard />
        </div>
      )}
      {touring && <Tour onClose={() => setTouring(false)} />}
      <LibraryDialog open={dialog === 'library'} onClose={() => setDialog(null)} />
      <ShareDialog open={dialog === 'share'} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Tells the 3D view which part of the window is not under a panel. */
function useClear(el: RefObject<HTMLDivElement | null>, desk: boolean) {
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const report = () => {
      const r = node.getBoundingClientRect();
      useUi.getState().setClear({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    report();
    const watch = new ResizeObserver(report);
    watch.observe(node);
    window.addEventListener('resize', report);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [el, desk]);
}

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * Keys that belong to the screen rather than to posing. On the desk the
 * posing keys do nothing; while posing, Esc with nothing selected lets go of
 * the fencer. Heard before the posing keys, which get the rest.
 */
function useScreenKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || document.querySelector('dialog[open], .popover-card')) return;
      const ui = useUi.getState();
      if (ui.desk) return e.stopPropagation();
      if (e.key !== 'Escape') return;
      const s = useEditor.getState();
      if (!s.selected && !s.pathEdit && !s.preview && ui.posing) ui.setPosing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

/** The distances for this step, when they are shown. */
function Readouts() {
  const s = useEditor();
  const step = currentStep(s);
  if (!step.display?.distance || s.preview) return null;
  const m = measure(s.combination, step);
  return (
    <dl className="readouts card">
      <div>
        <dt>Between front feet</dt>
        <dd>{formatDistance(m.feet.distance, s.units)}</dd>
      </div>
      {FENCERS.map((f) => (
        <div key={f}>
          <dt>
            {f}’s point to {f === 'A' ? 'B' : 'A'}
          </dt>
          <dd className={m.reach[f].distance < 0.01 ? 'touch' : ''}>
            {m.reach[f].distance < 0.01 ? 'Touch' : formatDistance(m.reach[f].distance, s.units)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** While the route into a step is being shaped. */
function PathBanner() {
  const s = useEditor();
  const step = currentStep(s);
  return (
    <div className="path-banner card" role="status">
      <p>
        <strong>
          Path from step {s.stepIndex} to {s.stepIndex + 1}
        </strong>
        <span>Drag the blue path up, down or sideways (up to 3 rings). Double-click a ring to remove it.</span>
      </p>
      <button
        onClick={() => FENCERS.forEach((f) => (step.pins?.[f] || step.via?.[f] || step.bend?.[f]) && s.setPins(f, null))}
        disabled={!isShaped(step)}
        title="Back to the plain, direct movement. The poses at both steps never change."
      >
        Straighten
      </button>
      <button className="primary" onClick={s.exitPath} title="Back to posing (Esc)">
        Done
      </button>
    </div>
  );
}

/** One line at the foot of the view: what to do next, or the way to stop. */
function Prompt({ posing }: { posing: boolean }) {
  const running = useEditor((s) => !!s.preview?.playing);
  const idle = useEditor((s) => !s.preview && !s.pathEdit);
  const locked = useEditor((s) => s.cameraLocked);
  const stop = useEditor((s) => s.stopPreview);
  if (running)
    return (
      <button className="prompt stop" onClick={stop} title="Stop playing (Space or Esc)">
        <PlayIcon stop /> Stop
      </button>
    );
  if (!idle) return null;
  if (locked)
    return (
      <p className="prompt">
        View locked · <kbd>L</kbd> unlocks
      </p>
    );
  return posing ? null : <p className="prompt">Click a fencer to pose them</p>;
}
