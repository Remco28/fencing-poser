import { useState } from 'react';
import { FENCERS, TARGET_NAMES, type FencerId, type TargetArea } from '../model/combination.ts';
import { formatDistance, formatHeight } from '../model/units.ts';
import { Toggle } from '../ui/Toggle.tsx';
import { STEP } from './keyboard.ts';
import { PresetsPanel } from './PresetsPanel.tsx';
import { currentStep, useEditor } from './store.ts';

type Tab = 'pose' | 'step' | 'fencers' | 'help';

const TABS: [Tab, string][] = [
  ['pose', 'Pose'],
  ['step', 'Step'],
  ['fencers', 'Fencers'],
  ['help', 'Help'],
];

function rememberedTab(): Tab {
  try {
    const t = localStorage.getItem('fencing-poser.tab');
    return TABS.some(([k]) => k === t) ? (t as Tab) : 'pose';
  } catch {
    return 'pose';
  }
}

export function Panel({ onOpenLibrary, onShare }: { onOpenLibrary: () => void; onShare: () => void }) {
  const s = useEditor();
  const [tab, setTabState] = useState<Tab>(rememberedTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem('fencing-poser.tab', t);
    } catch {
      // Remembering the tab is only a convenience.
    }
  };

  return (
    <aside className="panel">
      <header className="panel-head">
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
        <div className="head-row">
          <p className="save-state">
            {s.folder?.ready ? (
              <>Saved here and in “{s.folder.name}”</>
            ) : s.folder ? (
              <button className="link" onClick={onOpenLibrary}>
                Folder “{s.folder.name}” needs reconnecting
              </button>
            ) : (
              <>Saved in this browser</>
            )}
          </p>
          <div className="buttons">
            <button className="small" onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)">
              ↶ Undo
            </button>
            <button className="small" onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">
              ↷ Redo
            </button>
          </div>
        </div>
        <div className="posing">
          <span>Posing fencer</span>
          <Toggle label="Posing fencer" bare value={s.active} options={FENCERS.map((f) => [f, f])} onChange={s.setActive} />
          <kbd title="Switch fencer">F</kbd>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map(([key, name]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
              {name}
            </button>
          ))}
        </nav>
      </header>

      <div className="panel-body">
        {tab === 'pose' && <PoseTab />}
        {tab === 'step' && <StepTab />}
        {tab === 'fencers' && <FencersTab />}
        {tab === 'help' && <HelpTab />}
      </div>
    </aside>
  );
}

function PoseTab() {
  return (
    <>
      <section>
        <p className="hint">
          Drag a handle (<span className="dot hand" /> hand, <span className="dot point" /> point, <span className="dot foot" />{' '}
          foot, <span className="dot hips" /> hips), or click a body part (or press <kbd>Tab</kbd>) and use the controls
          beside it. Click the hips to step along the piste.
        </p>
        <PresetsPanel />
      </section>
      <BladesSection />
    </>
  );
}

function BladesSection() {
  const s = useEditor();
  const [message, setMessage] = useState('');
  const opp = s.active === 'A' ? 'B' : 'A';
  return (
    <section>
      <h2>Blades</h2>
      <div className="blade-row">
        <span>{s.active} engages</span>
        <div className="buttons">
          <button className="small" onClick={() => s.engageBlades('sixte')} title={`${s.active} lays the blade on ${opp}'s, closing ${s.active}'s outside line`}>
            in sixte
          </button>
          <button className="small" onClick={() => s.engageBlades('quarte')} title={`${s.active} lays the blade on ${opp}'s, closing ${s.active}'s inside line`}>
            in quarte
          </button>
        </div>
      </div>
      <div className="blade-row">
        <span>
          {s.active} touches {opp} on
        </span>
        <div className="buttons">
          {(Object.keys(TARGET_NAMES) as TargetArea[]).map((area) => (
            <button
              key={area}
              className="small"
              onClick={() => {
                const short = s.touchTarget(area);
                setMessage(
                  short
                    ? `${s.active}’s point is ${formatDistance(short, s.units)} short of ${opp}’s ${TARGET_NAMES[area].toLowerCase()}: step in or lunge first.`
                    : '',
                );
              }}
            >
              {TARGET_NAMES[area]}
            </button>
          ))}
        </div>
      </div>
      {message && <p className="message">{message}</p>}
      <p className="hint small">When one blade is moved into the other, the other is pushed aside rather than passing through.</p>
    </section>
  );
}

function StepTab() {
  const s = useEditor();
  const step = currentStep(s);
  return (
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

      <h3>Smooth playback</h3>
      <label className="inline">
        <span>Time to move into this step</span>
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
      <label className="check">
        <input type="checkbox" checked={!!step.motionOnly} onChange={(e) => s.setStepOptions({ motionOnly: e.target.checked })} />
        <span>
          <strong>Motion only.</strong> A <em>via</em> step: it shapes the movement (the point going under the blade) but is
          skipped when stepping through and in handouts.
        </span>
      </label>
    </section>
  );
}

function FencerSetupBlock({ fencer }: { fencer: FencerId }) {
  const s = useEditor();
  const setup = s.combination.fencers[fencer];
  return (
    <section>
      <h2>Fencer {fencer}</h2>
      <label className="dof">
        <span className="dof-head">
          <span>Height</span>
          <output>{formatHeight(setup.height, s.units)}</output>
        </span>
        <input
          type="range"
          aria-label={`Fencer ${fencer} height`}
          min={1.4}
          max={2.1}
          step={0.01}
          value={setup.height}
          onChange={(e) => s.setSetup({ height: Number(e.target.value) }, fencer)}
        />
      </label>
      <label className="dof">
        <span className="dof-head">
          <span>Build</span>
          <output>{setup.build < 0.95 ? 'Slight' : setup.build > 1.05 ? 'Broad' : 'Medium'}</output>
        </span>
        <input
          type="range"
          aria-label={`Fencer ${fencer} build`}
          min={0.85}
          max={1.2}
          step={0.01}
          value={setup.build}
          onChange={(e) => s.setSetup({ build: Number(e.target.value) }, fencer)}
        />
      </label>
      <Toggle
        label="Hand"
        value={setup.handedness}
        options={[
          ['right', 'Right'],
          ['left', 'Left'],
        ]}
        onChange={(handedness) => s.setSetup({ handedness }, fencer)}
      />
      <Toggle
        label="Grip"
        value={setup.grip}
        options={[
          ['pistol', 'Pistol'],
          ['french', 'French'],
        ]}
        onChange={(grip) => s.setSetup({ grip }, fencer)}
      />
    </section>
  );
}

function FencersTab() {
  return (
    <>
      {FENCERS.map((f) => (
        <FencerSetupBlock key={f} fencer={f} />
      ))}
    </>
  );
}

function HelpTab() {
  const s = useEditor();
  return (
    <>
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
          <dt>Space</dt>
          <dd>Play / stop</dd>
          <dt>N</dt>
          <dd>New step (copies this one)</dd>
          <dt>Ctrl+Z / Ctrl+Shift+Z</dt>
          <dd>Undo / redo</dd>
          <dt>H</dt>
          <dd>Show / hide drag handles</dd>
          <dt>Z / Shift+Z</dt>
          <dd>Zoom to both fencers / to the one you are posing</dd>
          <dt>L</dt>
          <dd>Lock / unlock the view</dd>
          <dt>Esc</dt>
          <dd>Deselect</dd>
        </dl>
      </section>
    </>
  );
}
