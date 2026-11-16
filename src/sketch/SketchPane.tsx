import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useEditor } from '../editor/store.ts';
import { Sketch } from './Sketch.tsx';

/** The strip's limits: at least this tall (px), at most this share of the stage. */
const MIN_PX = 140;
const MAX_SHARE = 0.75;

/** The sketch strip under the 3D view, with a divider above it to drag its height. */
export function SketchPane({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const height = useEditor((s) => s.sketch.height);
  const setHeight = useEditor((s) => s.setSketchHeight);
  const dragging = useRef(false);

  const resize = (e: ReactPointerEvent) => {
    const box = container.current?.getBoundingClientRect();
    if (!dragging.current || !box || box.height <= 0) return;
    const share = (box.bottom - e.clientY) / box.height;
    setHeight(Math.min(MAX_SHARE, Math.max(MIN_PX / box.height, share)));
  };

  return (
    <>
      <div
        className="sketch-divider"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize the sketch"
        title="Drag to resize the sketch"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
        }}
        onPointerMove={resize}
        onPointerUp={(e) => {
          dragging.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => (dragging.current = false)}
      />
      <div className="sketch-pane" style={{ height: `${height * 100}%`, minHeight: MIN_PX, maxHeight: `${MAX_SHARE * 100}%` }}>
        <Sketch />
      </div>
    </>
  );
}
