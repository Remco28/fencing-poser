import { useState } from 'react';
import { JOINT_BY_NAME, JOINTS, type JointName } from '../model/joints.ts';
import { angle } from '../model/types.ts';
import { NUDGE_LABELS, STEP } from './keyboard.ts';
import { useEditor, type Units } from './store.ts';

export function formatHeight(metres: number, units: Units): string {
  if (units === 'metric') return `${Math.round(metres * 100)} cm`;
  const inches = Math.round(metres / 0.0254);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

export function Panel() {
  const { setup, pose, selected, units, select, setAngle, resetJoint, setSetup, setUnits, undo, redo } = useEditor();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const joint = selected ? JOINT_BY_NAME[selected] : null;

  return (
    <aside className="panel">
      <header>
        <h1>Fencing Poser</h1>
        <p className="hint">Click a body part or the épée to pose it. Drag to orbit, scroll to zoom, right-drag to pan.</p>
        <div className="buttons">
          <button onClick={undo} disabled={!canUndo} title="Ctrl+Z">
            Undo
          </button>
          <button onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z">
            Redo
          </button>
        </div>
      </header>

      <Presets />

      <section>
        <h2>Joint</h2>
        <select value={selected ?? ''} onChange={(e) => select((e.target.value || null) as JointName | null)}>
          <option value="">Choose a joint…</option>
          {JOINTS.map((j) => (
            <option key={j.name} value={j.name}>
              {j.label}
            </option>
          ))}
        </select>
        {joint && (
          <div className="dofs">
            {joint.dofs.map((d, i) => {
              const value = angle(pose, joint.name, d.key);
              return (
                <label key={d.key} className="dof">
                  <span className="dof-head">
                    <span>
                      {d.label} <kbd>{NUDGE_LABELS[i]}</kbd>
                    </span>
                    <output>{Math.round(value)}°</output>
                  </span>
                  <input
                    type="range"
                    aria-label={`${joint.label}: ${d.label}`}
                    min={d.min}
                    max={d.max}
                    step={1}
                    value={value}
                    onChange={(e) => setAngle(joint.name, d.key, Number(e.target.value))}
                  />
                </label>
              );
            })}
            <button className="quiet" onClick={() => resetJoint(joint.name)}>
              Straighten this joint <kbd>R</kbd>
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Fencer</h2>
        <label className="dof">
          <span className="dof-head">
            <span>Height</span>
            <output>{formatHeight(setup.height, units)}</output>
          </span>
          <input
            type="range"
            aria-label="Height"
            min={1.4}
            max={2.1}
            step={0.01}
            value={setup.height}
            onChange={(e) => setSetup({ height: Number(e.target.value) })}
          />
        </label>
        <label className="dof">
          <span className="dof-head">
            <span>Build</span>
            <output>{setup.build < 0.95 ? 'Slight' : setup.build > 1.05 ? 'Broad' : 'Medium'}</output>
          </span>
          <input
            type="range"
            aria-label="Build"
            min={0.85}
            max={1.2}
            step={0.01}
            value={setup.build}
            onChange={(e) => setSetup({ build: Number(e.target.value) })}
          />
        </label>
        <Toggle
          label="Hand"
          value={setup.handedness}
          options={[
            ['right', 'Right'],
            ['left', 'Left'],
          ]}
          onChange={(handedness) => setSetup({ handedness })}
        />
        <Toggle
          label="Grip"
          value={setup.grip}
          options={[
            ['pistol', 'Pistol'],
            ['french', 'French'],
          ]}
          onChange={(grip) => setSetup({ grip })}
        />
        <Toggle
          label="Units"
          value={units}
          options={[
            ['metric', 'Metric'],
            ['imperial', 'Imperial'],
          ]}
          onChange={setUnits}
        />
      </section>

      <section>
        <h2>Keys</h2>
        <dl className="keys">
          <dt>Tab / Shift+Tab</dt>
          <dd>Next / previous joint</dd>
          <dt>X</dt>
          <dd>Same joint, other side</dd>
          <dt>A D · S W · Q E</dt>
          <dd>Move the joint (arrows work too)</dd>
          <dt>Shift / Alt</dt>
          <dd>
            Big ({STEP.big}°) / fine ({STEP.fine}°) steps
          </dd>
          <dt>R</dt>
          <dd>Straighten the joint</dd>
          <dt>Ctrl+Z / Ctrl+Shift+Z</dt>
          <dd>Undo / redo</dd>
          <dt>Esc</dt>
          <dd>Deselect</dd>
        </dl>
      </section>
    </aside>
  );
}

function Presets() {
  const { presets, applyPreset, saveCurrentAsPreset, updatePreset, renamePreset, removePreset } = useEditor();
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const saveNew = () => {
    if (naming?.trim()) saveCurrentAsPreset(naming.trim());
    setNaming(null);
  };

  return (
    <section>
      <div className="section-head">
        <h2>Poses</h2>
        <button className="link" onClick={() => setEditing(!editing)} aria-pressed={editing}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {!editing && (
        <div className="buttons">
          {presets.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p)}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ul className="preset-list">
          {presets.map((p) => (
            <li key={`${p.id}:${p.name}`}>
              <input
                aria-label="Preset name"
                defaultValue={p.name}
                onBlur={(e) => e.target.value !== p.name && renamePreset(p.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <div className="row-actions">
                {confirming === p.id ? (
                  <>
                    <button
                      onClick={() => {
                        updatePreset(p.id);
                        setConfirming(null);
                      }}
                    >
                      Replace with current pose
                    </button>
                    <button className="quiet" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="quiet" onClick={() => setConfirming(p.id)} title="Save the current pose into this preset">
                      Update
                    </button>
                    {p.builtIn ? (
                      p.modified && (
                        <button className="quiet" onClick={() => removePreset(p.id)} title="Go back to the original">
                          Restore
                        </button>
                      )
                    ) : (
                      <button className="quiet" onClick={() => removePreset(p.id)}>
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {naming === null ? (
        <button className="quiet" onClick={() => setNaming('')}>
          + Save current pose as a preset
        </button>
      ) : (
        <form
          className="name-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveNew();
          }}
        >
          <input
            autoFocus
            placeholder="Name, e.g. Parry 4"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
          />
          <button type="submit" disabled={!naming.trim()}>
            Save
          </button>
        </form>
      )}
    </section>
  );
}

function Toggle<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="toggle">
      <span>{props.label}</span>
      <div role="radiogroup" aria-label={props.label}>
        {props.options.map(([value, text]) => (
          <button
            key={value}
            role="radio"
            aria-checked={props.value === value}
            className={props.value === value ? 'on' : ''}
            onClick={() => props.onChange(value)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
