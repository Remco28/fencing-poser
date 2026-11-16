import { useState } from 'react';
import { FENCERS, type FencerId } from '../model/combination.ts';
import { formatHeight } from '../model/units.ts';
import { Icon } from '../ui/Icon.tsx';
import { Toggle } from '../ui/Toggle.tsx';
import { ActionsPanel } from './ActionsPanel.tsx';
import { PresetsPanel } from './PresetsPanel.tsx';
import { useEditor } from './store.ts';
import { useUi } from './ui.ts';

/**
 * Everything for the fencer being posed, and nothing else: who they are, what
 * stays still while they are dragged, help with the blade, and the coach's
 * own saved poses. It shows only while a fencer is picked.
 */
export function Tray() {
  const s = useEditor();
  const [setup, setSetup] = useState(false);
  const me = s.active;
  const who = s.combination.fencers[me];

  return (
    <aside className="tray card" aria-label={`Fencer ${me}`}>
      <header className="tray-head">
        <span className={`wood ${me === 'A' ? 'maple' : 'walnut'}`} aria-hidden />
        <h2>Fencer {me}</h2>
        <Toggle label="Fencer being posed" bare value={me} options={FENCERS.map((f) => [f, f])} onChange={s.setActive} />
        <button className="icon" onClick={() => useUi.getState().setPosing(false)} title="Done posing (Esc)" aria-label="Done posing">
          <Icon name="close" />
        </button>
      </header>
      <p className="tray-who">
        {who.handedness === 'right' ? 'Right-handed' : 'Left-handed'} · {who.grip === 'pistol' ? 'pistol grip' : 'French grip'} ·{' '}
        {formatHeight(who.height, s.units)}{' '}
        <button className="link" aria-expanded={setup} onClick={() => setSetup(!setup)}>
          {setup ? 'Done' : 'Change'}
        </button>
      </p>
      {setup && <FencerSetup fencer={me} />}

      <div className="tray-row keep" role="group" aria-label="Keep still while dragging">
        <span className="caps" title="What stays where it is while you drag anything else">
          Keep still
        </span>
        <button className="small" aria-pressed={s.keep.feet} onClick={() => s.toggleKeep('feet')} title="Both feet stay where they are while you move anything else">
          Feet
        </button>
        <button className="small" aria-pressed={s.keep.hand} onClick={() => s.toggleKeep('hand')} title="The weapon hand stays where it is while you move anything else">
          Hand
        </button>
        <button className="small" aria-pressed={s.keep.point} onClick={() => s.toggleKeep('point')} title="The épée point stays where it is while you move anything else">
          Point
        </button>
      </div>

      <ActionsPanel />
      <PresetsPanel />
    </aside>
  );
}

/** Height, build, hand and grip: set once, then out of the way. */
function FencerSetup({ fencer }: { fencer: FencerId }) {
  const s = useEditor();
  const setup = s.combination.fencers[fencer];
  return (
    <div className="fencer-setup">
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
    </div>
  );
}
