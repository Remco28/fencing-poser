import { useEffect, useRef, useState } from 'react';
import { GROUP_NAMES, type PresetGroup } from '../presets/builtin.ts';
import type { ShownPreset } from '../presets/library.ts';
import { Toggle } from '../ui/Toggle.tsx';
import { useEditor, type PresetPart } from './store.ts';

const PART_HINT: Record<PresetPart, string> = {
  all: 'Clicking a pose sets the whole body.',
  upper: 'Clicking a pose sets only the arms, torso and head; the legs stay as they are.',
  lower: 'Clicking a pose sets only the hips and legs; the arms and torso stay as they are.',
};

function groupOf(p: ShownPreset): PresetGroup {
  return p.builtIn ? (p.group ?? 'footwork') : 'mine';
}

/** Built-in and saved poses. Each has a ⋯ menu to replace it with the current pose, rename or delete it. */
export function PresetsPanel() {
  const { presets, presetPart, setPresetPart, applyPreset, active } = useEditor();
  const [menu, setMenu] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);

  return (
    <div className="presets">
      <h3 className="apply-head">Apply a pose to</h3>
      <Toggle
        label="Apply a pose to"
        bare
        value={presetPart}
        options={[
          ['all', 'Whole body'],
          ['upper', 'Arms & torso'],
          ['lower', 'Legs'],
        ]}
        onChange={setPresetPart}
      />
      <p className="hint small">{PART_HINT[presetPart]}</p>

      {(Object.keys(GROUP_NAMES) as PresetGroup[]).map((group) => {
        const inGroup = presets.filter((p) => groupOf(p) === group);
        if (!inGroup.length) return null;
        return (
          <div key={group} className="preset-group">
            <h4>{GROUP_NAMES[group]}</h4>
            <div className="buttons">
              {inGroup.map((p) => (
                <PresetButton
                  key={p.id}
                  preset={p}
                  open={menu === p.id}
                  onMenu={(open) => setMenu(open ? p.id : null)}
                  onApply={() => applyPreset(p)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {naming === null ? (
        <button className="quiet" onClick={() => setNaming('')}>
          + Save {active}’s pose as a preset
        </button>
      ) : (
        <SaveForm name={naming} setName={setNaming} />
      )}
    </div>
  );
}

function PresetButton(props: { preset: ShownPreset; open: boolean; onMenu: (open: boolean) => void; onApply: () => void }) {
  const { preset: p } = props;
  const { updatePreset, renamePreset, removePreset, applyPresetToOther, active } = useEditor();
  const opp = active === 'A' ? 'B' : 'A';
  const [mode, setMode] = useState<'menu' | 'replace' | 'rename' | 'delete'>('menu');
  const box = useRef<HTMLDivElement>(null);
  // The menu opens below the chip, kept on screen.
  const [at, setAt] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!props.open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 260)), top: r.bottom + 4 });
  }, [props.open]);

  // Close the menu on a click anywhere else.
  useEffect(() => {
    if (!props.open) return;
    setMode('menu');
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) props.onMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const close = () => props.onMenu(false);

  if (props.open && mode === 'rename') {
    return (
      <div className="preset-chip renaming" ref={box}>
        <input
          autoFocus
          aria-label="New name"
          defaultValue={p.name}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              renamePreset(p.id, e.currentTarget.value);
              close();
            }
            if (e.key === 'Escape') close();
          }}
          onBlur={(e) => {
            renamePreset(p.id, e.currentTarget.value);
            close();
          }}
        />
      </div>
    );
  }

  return (
    <div className={`preset-chip${p.builtIn ? '' : ' mine'}${p.modified ? ' modified' : ''}`} ref={box}>
      <button className="small apply" onClick={props.onApply} title={p.modified ? 'Your changed version of this pose' : undefined}>
        {p.name}
        {p.modified && <span className="changed" aria-label="changed"> •</span>}
      </button>
      <button
        className="small more"
        aria-label={`More for ${p.name}`}
        aria-expanded={props.open}
        onClick={() => props.onMenu(!props.open)}
      >
        ⋯
      </button>
      {props.open && (
        <div className="menu" role="menu" style={{ left: at.left, top: at.top }}>
          {mode === 'menu' && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  applyPresetToOther(p);
                  close();
                }}
              >
                Apply to {opp}
              </button>
              <button role="menuitem" onClick={() => setMode('replace')}>
                Replace with {active}’s current pose
              </button>
              <button role="menuitem" onClick={() => setMode('rename')}>
                Rename
              </button>
              {p.builtIn ? (
                p.modified && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      removePreset(p.id);
                      close();
                    }}
                  >
                    Restore the original
                  </button>
                )
              ) : (
                <button role="menuitem" className="danger" onClick={() => setMode('delete')}>
                  Delete
                </button>
              )}
            </>
          )}
          {mode === 'replace' && (
            <>
              <p>
                Replace “{p.name}” with {active}’s current pose?
              </p>
              <div className="buttons">
                <button
                  className="primary"
                  onClick={() => {
                    updatePreset(p.id);
                    close();
                  }}
                >
                  Replace
                </button>
                <button onClick={close}>Cancel</button>
              </div>
            </>
          )}
          {mode === 'delete' && (
            <>
              <p>Delete “{p.name}”? Combinations that used it keep their poses.</p>
              <div className="buttons">
                <button
                  className="danger"
                  onClick={() => {
                    removePreset(p.id);
                    close();
                  }}
                >
                  Delete
                </button>
                <button onClick={close}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SaveForm({ name, setName }: { name: string; setName: (name: string | null) => void }) {
  const { presets, saveCurrentAsPreset, updatePreset } = useEditor();
  const clash = presets.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const save = () => {
    if (!name.trim()) return;
    if (clash) updatePreset(clash.id);
    else saveCurrentAsPreset(name.trim());
    setName(null);
  };
  return (
    <form
      className="name-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="name-row">
        <input
          autoFocus
          placeholder="Name, e.g. Parry 4 low"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setName(null)}
        />
        <button type="submit" className="primary" disabled={!name.trim()}>
          {clash ? 'Replace' : 'Save'}
        </button>
        <button type="button" onClick={() => setName(null)}>
          Cancel
        </button>
      </div>
      {clash && <p className="hint small">There is already a pose called “{clash.name}”. Saving replaces it.</p>}
    </form>
  );
}
