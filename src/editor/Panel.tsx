import { useState } from 'react';
import { FENCERS, TARGET_NAMES, type TargetArea } from '../model/combination.ts';
import { GROUP_NAMES, type PresetGroup } from '../presets/builtin.ts';
import { JOINT_BY_NAME, JOINTS, type JointName } from '../model/joints.ts';
import { angle } from '../model/types.ts';
import { NUDGE_LABELS, STEP } from './keyboard.ts';
import { formatDistance, formatHeight } from '../model/units.ts';
import { activePose, activeSetup, currentStep, useEditor } from './store.ts';

export function Panel({ onOpenLibrary, onShare }: { onOpenLibrary: () => void; onShare: () => void }) {
  const s = useEditor();
  const pose = activePose(s);
  const setup = activeSetup(s);
  const step = currentStep(s);
  const joint = s.selected ? JOINT_BY_NAME[s.selected] : null;

  return (
    <aside className="panel">
      <header>
        <div className="section-head">
          <input
            className="title"
            aria-label="Combination title"
            value={s.combination.title}
            onChange={(e) => s.setTitle(e.target.value)}
          />
          <button onClick={onOpenLibrary}>Library</button>
          <button className="primary" onClick={onShare} title="Share with students, or export a picture, handout or video">
            Share
          </button>
        </div>
        <p className="save-state">
          {s.folder?.ready ? (
            <>Saved in this browser and the folder “{s.folder.name}”</>
          ) : s.folder ? (
            <button className="link" onClick={onOpenLibrary}>
              Folder “{s.folder.name}” needs reconnecting
            </button>
          ) : (
            <>Saved in this browser</>
          )}
        </p>
        <div className="buttons">
          <button onClick={s.undo} disabled={!s.past.length} title="Ctrl+Z">
            Undo
          </button>
          <button onClick={s.redo} disabled={!s.future.length} title="Ctrl+Shift+Z">
            Redo
          </button>
        </div>
      </header>

      <section>
        <h2>
          Step {s.stepIndex + 1} of {s.combination.steps.length}
        </h2>
        <input
          className="wide"
          aria-label="Step label"
          placeholder="Label, e.g. Feint disengage"
          value={step.label}
          onChange={(e) => s.setStepText({ label: e.target.value })}
        />
        <textarea
          className="wide"
          aria-label="Coaching notes"
          placeholder="Notes for students (optional)"
          rows={3}
          value={step.notes}
          onChange={(e) => s.setStepText({ notes: e.target.value })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={!!step.motionOnly}
            onChange={(e) => s.setStepOptions({ motionOnly: e.target.checked })}
          />
          <span>
            Motion only: a <em>via</em> step that shapes smooth playback (the point going under the blade) and is skipped
            when stepping through
          </span>
        </label>
        <label className="inline">
          <span>Smooth playback: move into this step in</span>
          <select
            value={step.durationMs ?? 1000}
            onChange={(e) => s.setStepOptions({ durationMs: Number(e.target.value) })}
            disabled={s.stepIndex === 0}
          >
            {[250, 500, 750, 1000, 1500, 2000, 3000].map((ms) => (
              <option key={ms} value={ms}>
                {ms / 1000} s
              </option>
            ))}
          </select>
        </label>
        <h3>Highlight a target</h3>
        {FENCERS.map((f) => (
          <div key={f} className="target-row">
            <span>{f}</span>
            <div className="buttons">
              {(Object.keys(TARGET_NAMES) as TargetArea[]).map((area) => {
                const on = step.display?.targets?.some((t) => t.fencer === f && t.area === area) ?? false;
                return (
                  <button key={area} className="small" aria-pressed={on} onClick={() => s.toggleTarget(f, area)}>
                    {TARGET_NAMES[area]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section>
        <div className="section-head">
          <h2>Posing fencer</h2>
          <Toggle label="Fencer" value={s.active} options={FENCERS.map((f) => [f, f])} onChange={s.setActive} />
        </div>
        <p className="hint">
          Drag the coloured handles to pose: <span className="dot hand" /> hands, <span className="dot point" /> point,{' '}
          <span className="dot foot" /> feet, <span className="dot hips" /> hips. Or click a body part and fine-tune it
          below. <kbd>H</kbd> hides the handles.
        </p>
        <Presets />
      </section>

      <section>
        <h2>Joint</h2>
        <select value={s.selected ?? ''} onChange={(e) => s.select((e.target.value || null) as JointName | null)}>
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
                    onChange={(e) => s.setAngle(joint.name, d.key, Number(e.target.value))}
                  />
                </label>
              );
            })}
            <button className="quiet" onClick={() => s.resetJoint(joint.name)}>
              Straighten this joint <kbd>R</kbd>
            </button>
          </div>
        )}
        <label className="dof">
          <span className="dof-head">
            <span>
              Position on the piste <kbd>[ ]</kbd>
            </span>
            <output>{formatDistance(pose.root.x, s.units)}</output>
          </span>
          <input
            type="range"
            aria-label="Position on the piste"
            min={-8.5}
            max={8.5}
            step={0.01}
            value={pose.root.x}
            onChange={(e) => s.setPosition(Number(e.target.value))}
          />
        </label>
      </section>

      <section>
        <h2>Fencer {s.active}</h2>
        <label className="dof">
          <span className="dof-head">
            <span>Height</span>
            <output>{formatHeight(setup.height, s.units)}</output>
          </span>
          <input
            type="range"
            aria-label="Height"
            min={1.4}
            max={2.1}
            step={0.01}
            value={setup.height}
            onChange={(e) => s.setSetup({ height: Number(e.target.value) })}
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
            onChange={(e) => s.setSetup({ build: Number(e.target.value) })}
          />
        </label>
        <Toggle
          label="Hand"
          value={setup.handedness}
          options={[
            ['right', 'Right'],
            ['left', 'Left'],
          ]}
          onChange={(handedness) => s.setSetup({ handedness })}
        />
        <Toggle
          label="Grip"
          value={setup.grip}
          options={[
            ['pistol', 'Pistol'],
            ['french', 'French'],
          ]}
          onChange={(grip) => s.setSetup({ grip })}
        />
      </section>

      <section>
        <h2>Settings</h2>
        <Toggle
          label="Units"
          value={s.units}
          options={[
            ['metric', 'Metric'],
            ['imperial', 'Imperial'],
          ]}
          onChange={s.setUnits}
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
          <dt>F</dt>
          <dd>Switch fencer</dd>
          <dt>[ ]</dt>
          <dd>Step back / forward on the piste</dd>
          <dt>, .</dt>
          <dd>Previous / next step</dd>
          <dt>N</dt>
          <dd>New step (copies this one)</dd>
          <dt>Ctrl+Z / Ctrl+Shift+Z</dt>
          <dd>Undo / redo</dd>
          <dt>H</dt>
          <dd>Show / hide drag handles</dd>
          <dt>Z / Shift+Z</dt>
          <dd>Fit both fencers / the one you are posing in view</dd>
          <dt>L</dt>
          <dd>Lock / unlock the view</dd>
          <dt>Esc</dt>
          <dd>Deselect</dd>
        </dl>
      </section>
    </aside>
  );
}

function Presets() {
  const { presets, applyPreset, saveCurrentAsPreset, updatePreset, renamePreset, removePreset, presetPart, setPresetPart } =
    useEditor();
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const saveNew = () => {
    if (naming?.trim()) saveCurrentAsPreset(naming.trim());
    setNaming(null);
  };

  return (
    <div className="presets">
      <div className="section-head">
        <h3>Poses</h3>
        <button className="link" onClick={() => setEditing(!editing)} aria-pressed={editing}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {!editing && (
        <Toggle
          label="Apply to"
          value={presetPart}
          options={[
            ['all', 'Whole body'],
            ['upper', 'Upper'],
            ['lower', 'Legs'],
          ]}
          onChange={setPresetPart}
        />
      )}
      {!editing &&
        (Object.keys(GROUP_NAMES) as PresetGroup[]).map((group) => {
          const inGroup = presets.filter((p) => (p.builtIn ? (p.group ?? 'footwork') : 'mine') === group);
          if (!inGroup.length) return null;
          return (
            <div key={group} className="preset-group">
              <h4>{GROUP_NAMES[group]}</h4>
              <div className="buttons">
                {inGroup.map((p) => (
                  <button key={p.id} className="small" onClick={() => applyPreset(p)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

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
    </div>
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
