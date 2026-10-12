import type { ReactNode } from 'react';

/** An on/off button that looks it: a small track and knob beside the label. */
export function Switch(props: { on: boolean; onToggle: () => void; children: ReactNode; title?: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={props.on}
      className={`switch${props.on ? ' on' : ''}`}
      onClick={props.onToggle}
      title={props.title}
      disabled={props.disabled}
    >
      <span className="track" aria-hidden>
        <span className="knob" />
      </span>
      {props.children}
    </button>
  );
}
