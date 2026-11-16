import type { ReactNode } from 'react';

// One family of icons: a 16-unit box, lines of one weight with round ends,
// drawn in the colour of the text beside them.

const PATHS = {
  back: <path d="M10 3 5 8l5 5" />,
  forward: <path d="m6 3 5 5-5 5" />,
  undo: <path d="M6 3 2.5 6.5 6 10M3 6.5h6.5a4 4 0 0 1 0 8H7" />,
  redo: <path d="M10 3l3.5 3.5L10 10M13 6.5H6.5a4 4 0 0 0 0 8H9" />,
  history: (
    <>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.5v2.8h2.8" />
      <path d="M8 5v3.2l2 1.3" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.8" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  check: <path d="m3 8.5 3.2 3.2L13 4.8" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3.3 3.3" />
    </>
  ),
  share: <path d="M8 10V2.5M5 5l3-3 3 3M3 9v3.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />,
  arrow: <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />,
  curve: <path d="M2.5 10C4 4 7 4 8 8s4 4 5.5-2M11 5l2.5 1L12.7 8.6" />,
  pencil: <path d="m3 13 .6-3L11 2.6l2.4 2.4L6 12.4 3 13Z" />,
  folder: <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z" />,
  more: (
    <>
      <circle cx="3.5" cy="8" r="0.6" />
      <circle cx="8" cy="8" r="0.6" />
      <circle cx="12.5" cy="8" r="0.6" />
    </>
  ),
  loop: <path d="M3 7a4 4 0 0 1 4-4h4.5M9.5 1l2 2-2 2M13 9a4 4 0 0 1-4 4H4.5M6.5 15l-2-2 2-2" />,
  help: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.7-.8 1.3" />
      <path d="M8 11.6v.1" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  note: <path d="M3 3.5h10M3 6.5h10M3 9.5h6M3 12.5h4" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** Play and Stop are solid, as on every player. */
export function PlayIcon({ stop = false }: { stop?: boolean }) {
  return (
    <svg className="icon solid" viewBox="0 0 16 16" aria-hidden>
      {stop ? <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" /> : <path d="M4.5 2.5v11l9-5.5-9-5.5Z" />}
    </svg>
  );
}
