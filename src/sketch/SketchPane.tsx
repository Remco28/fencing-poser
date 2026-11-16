import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useEditor } from '../editor/store.ts';
import { Sketch } from './Sketch.tsx';

/** The sheet's limits: at least this tall (px), at most this share of the window. */
const MIN_PX = 150;
const MAX_SHARE = 0.55;
/** The height is kept as a share of the room left for the view and the sketch together, which is about this much of the window. */
const ROOM = 0.62;

/**
 * The sketch: a sheet of paper lying on the desk under the 3D view, with the
 * same two fencers drawn flat on it. Drag its top edge to make it taller.
 */
export function SketchPane() {
  const height = useEditor((s) => s.sketch.height);
  const setHeight = useEditor((s) => s.setSketchHeight);
  const sheet = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const resize = (e: ReactPointerEvent) => {
    const box = sheet.current?.getBoundingClientRect();
    if (!dragging.current || !box) return;
    const share = (box.bottom - e.clientY) / window.innerHeight;
    setHeight(Math.min(MAX_SHARE, Math.max(MIN_PX / window.innerHeight, share)) / ROOM);
  };

  return (
    <div className="sketch-sheet" ref={sheet} style={{ height: `${Math.min(MAX_SHARE, height * ROOM) * 100}vh`, minHeight: MIN_PX }}>
      <Sketch />
      <div
        className="sketch-grab"
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
    </div>
  );
}
