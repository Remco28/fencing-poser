import { JOINT_BY_NAME, JOINTS, type JointName } from '../model/joints.ts';
import { angle } from '../model/types.ts';
import { BUILT_IN_PRESETS } from '../presets/builtin.ts';
import { useEditor, type Units } from './store.ts';

export function formatHeight(metres: number, units: Units): string {
  if (units === 'metric') return `${Math.round(metres * 100)} cm`;
  const inches = Math.round(metres / 0.0254);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

export function Panel() {
  const { setup, pose, selected, units, select, setAngle, resetJoint, applyPreset, setSetup, setUnits } = useEditor();
  const joint = selected ? JOINT_BY_NAME[selected] : null;

  return (
    <aside className="panel">
      <header>
        <h1>Fencing Poser</h1>
        <p className="hint">Click a body part or the épée to pose it. Drag to orbit, scroll to zoom, right-drag to pan.</p>
      </header>

      <section>
        <h2>Poses</h2>
        <div className="buttons">
          {BUILT_IN_PRESETS.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p)}>
              {p.name}
            </button>
          ))}
        </div>
      </section>

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
            {joint.dofs.map((d) => {
              const value = angle(pose, joint.name, d.key);
              return (
                <label key={d.key} className="dof">
                  <span className="dof-head">
                    <span>{d.label}</span>
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
              Straighten this joint
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
    </aside>
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
