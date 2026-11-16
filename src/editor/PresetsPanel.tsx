import { useState } from 'react';
import type { PresetPose } from '../presets/builtin.ts';
import { Popover } from '../ui/Popover.tsx';
import { useEditor } from './store.ts';

/**
 * The coach's own poses: saved with one click, put back with one click.
 * Under ⋯ a pose can be renamed, replaced with the pose on screen, or deleted
 * (and that undone). There are no ready-made poses but the plain en garde.
 */
export function PresetsPanel() {
  const poses = useEditor((s) => s.savedPresets);
  const active = useEditor((s) => s.active);
  const { applyPreset, resetPose, saveCurrentAsPreset, restorePreset } = useEditor.getState();
  const [naming, setNaming] = useState<string | null>(null);
  const [removed, setRemoved] = useState<PresetPose | null>(null);

  return (
    <section className="presets mine">
      <div className="actions-head">
        <h2>Your poses</h2>
        <button
          className="small"
          title={`Save ${active}’s pose as it is now, to use again on either fencer in any combination`}
          onClick={() => {
            setRemoved(null);
            // Saved at once under a plain name, which can be typed over straight away.
            setNaming(saveCurrentAsPreset());
          }}
        >
          + Save {active}’s pose
        </button>
      </div>
      {poses.length > 0 ? (
        <div className="buttons pose-list">
          {poses.map((p) => (
            <PoseChip
              key={p.id}
              pose={p}
              naming={naming === p.id}
              onNaming={(on) => setNaming(on ? p.id : null)}
              onApply={() => applyPreset(p)}
              onRemoved={() => setRemoved(p)}
            />
          ))}
        </div>
      ) : (
        <p className="hint small">A pose you will want again? Save it here, and one click gives it to either fencer.</p>
      )}
      {removed && (
        <p className="message" role="status">
          Deleted “{removed.name}”.{' '}
          <button
            className="link"
            onClick={() => {
              restorePreset(removed);
              setRemoved(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      <button className="quiet" onClick={resetPose} title={`${active} goes back to the plain en garde, standing where they are`}>
        Reset {active} to en garde
      </button>
    </section>
  );
}

function PoseChip(props: {
  pose: PresetPose;
  naming: boolean;
  onNaming: (on: boolean) => void;
  onApply: () => void;
  onRemoved: () => void;
}) {
  const { pose: p } = props;
  const active = useEditor((s) => s.active);
  const { updatePreset, renamePreset, removePreset } = useEditor.getState();
  if (props.naming) {
    const finish = (name: string) => {
      renamePreset(p.id, name);
      props.onNaming(false);
    };
    return (
      <div className="preset-chip renaming">
        <input
          autoFocus
          aria-label="Name of the pose"
          defaultValue={p.name}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            // Typing a name must not pose the fencer.
            e.stopPropagation();
            if (e.key === 'Enter') finish(e.currentTarget.value);
            if (e.key === 'Escape') props.onNaming(false);
          }}
          onBlur={(e) => finish(e.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <div className="preset-chip mine">
      <button className="small apply" onClick={props.onApply} title={`Give ${active} this pose, standing where they are`}>
        {p.name}
      </button>
      {/* A floating card, drawn above everything, so the tray's edge cannot clip it. */}
      <Popover className="small more" label={<span aria-hidden>⋯</span>} title={`More for ${p.name}`} width={230}>
        {(close) => (
          <div className="menu-list">
            <button onClick={() => (close(), props.onNaming(true))}>Rename</button>
            <button onClick={() => (close(), updatePreset(p.id))} title={`“${p.name}” becomes ${active}’s pose as it is now`}>
              Replace with {active}’s pose now
            </button>
            <button
              className="danger"
              onClick={() => {
                close();
                removePreset(p.id);
                props.onRemoved();
              }}
            >
              Delete
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}
