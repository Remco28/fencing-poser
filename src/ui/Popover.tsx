import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Side = 'below' | 'above' | 'right';

/**
 * A button that opens a small floating card beside itself. The card closes on
 * a click anywhere else or on Esc, and is placed on screen wherever its
 * button is, so it also works inside a list that scrolls. It is drawn at the
 * top of the page, not inside its button's panel, so no panel can clip it.
 */
export function Popover(props: {
  /** What the button shows. */
  label: ReactNode;
  /** For screen readers and the tooltip, when the button is only an icon. */
  title?: string;
  className?: string;
  side?: Side;
  /** Line the card up with the button's start (left) or end (right) edge. */
  align?: 'start' | 'end';
  width?: number;
  disabled?: boolean;
  /** Controlled from outside, when something else can also open or close it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const { side = 'below', align = 'start', width = 260 } = props;
  const [own, setOwn] = useState(false);
  const open = props.open ?? own;
  const setOpen = (next: boolean) => {
    setOwn(next);
    props.onOpenChange?.(next);
  };
  const box = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !box.current || !card.current) return setAt(null);
    const place = () => {
      const b = box.current!.getBoundingClientRect();
      const c = card.current!.getBoundingClientRect();
      const gap = 8;
      let left = side === 'right' ? b.right + gap : align === 'end' ? b.right - c.width : b.left;
      let top = side === 'below' ? b.bottom + gap : side === 'above' ? b.top - gap - c.height : b.top;
      left = Math.max(gap, Math.min(left, window.innerWidth - c.width - gap));
      top = Math.max(gap, Math.min(top, window.innerHeight - c.height - gap));
      setAt({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, side, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !card.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => setOpen(false);
  return (
    <span className="popover" ref={box}>
      <button
        className={props.className}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={props.title}
        aria-label={typeof props.label === 'string' ? undefined : props.title}
        disabled={props.disabled}
        onClick={() => setOpen(!open)}
      >
        {props.label}
      </button>
      {open &&
        createPortal(
          <div
            ref={card}
            className="popover-card"
            role="dialog"
            aria-label={props.title}
            style={{ width, left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? 'visible' : 'hidden' }}
          >
            {typeof props.children === 'function' ? props.children(close) : props.children}
          </div>,
          document.body,
        )}
    </span>
  );
}
