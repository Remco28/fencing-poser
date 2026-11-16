import { useState, type ReactNode } from 'react';
import type { Action, Footwork, HitWith, Line, Measure, ParryNumber, PathShape } from '../actions/actions.ts';
import { TARGET_NAMES, type TargetArea } from '../model/combination.ts';
import { formatDistance } from '../model/units.ts';
import { Switch } from '../ui/Switch.tsx';
import { Toggle } from '../ui/Toggle.tsx';
import { useEditor } from './store.ts';

const FEET: [Footwork, string][] = [
  ['advance', 'Advance'],
  ['retreat', 'Retreat'],
  ['half-lunge', 'Half lunge'],
  ['lunge', 'Lunge'],
  ['recover', 'Recover'],
  ['fleche', 'Flèche'],
];

const PARRIES: [ParryNumber, string][] = [
  [1, 'prime'],
  [2, 'seconde'],
  [3, 'tierce'],
  [4, 'quarte'],
  [6, 'sixte'],
  [7, 'septime'],
  [8, 'octave'],
];

const LINES: [Line, number][] = [
  ['quarte', 4],
  ['sixte', 6],
];

/** Named fencing actions for the posing fencer: one click poses (and, if asked, adds and names) a step. */
export function ActionsPanel({ children }: { children?: ReactNode }) {
  const s = useEditor();
  const [message, setMessage] = useState('');
  const me = s.active;
  const opp = me === 'A' ? 'B' : 'A';
  const first = s.stepIndex === 0;

  const run = (action: Action) => {
    const { short, close, apart, cramped } = s.act(action);
    if (apart) return setMessage('The blades are too far apart to meet: step in first.');
    if (cramped === 'blocked') return setMessage(`No room: ${opp} is too close. Step back first.`);
    if (cramped === 'short' && action.kind === 'footwork')
      return setMessage(`${opp} is close: ${me} went only as far as there was room, with the back foot where it was.`);
    if (action.kind === 'hit' && !short && cramped === 'short')
      return setMessage(`${opp} is too close for a ${action.with === 'fleche' ? 'flèche' : 'lunge'}: ${me} hit with the arm alone.`);
    if (action.kind !== 'hit' || !short) return setMessage('');
    if (close) return setMessage(`${opp}’s ${TARGET_NAMES[action.area].toLowerCase()} is too close for ${me}’s point to land: step back first.`);
    const gap = `${me}’s point is ${formatDistance(short, s.units)} short of ${opp}’s ${TARGET_NAMES[action.area].toLowerCase()}`;
    const advice: Record<HitWith, string> = {
      arm: 'step in or lunge first',
      lunge: 'too far for a lunge from here, step in first',
      fleche: 'too far for a flèche from here, step in first',
    };
    setMessage(`${gap}: ${advice[action.with]}.`);
  };

  const measures: [Measure, string, string][] = [
    ['short', 'Short', `Stand where ${me}’s extended arm reaches ${opp}’s body`],
    ['medium', 'Medium', `Stand where ${me}’s lunge reaches ${opp}’s body`],
    ['long', 'Long', `Stand where an advance and a lunge reach ${opp}’s body`],
  ];
  const paths: [PathShape, string, string][] = [
    ['direct', 'Direct', 'The plain movement'],
    ['under', 'Under the blade', `A disengage: the point passes under ${opp}’s blade`],
    ['over', 'Over the blade', `A cut-over: the point passes over ${opp}’s point`],
  ];
  const hitWith: [HitWith, string][] = [
    ['arm', 'Arm'],
    ['lunge', 'Lunge'],
    ['fleche', 'Flèche'],
  ];

  return (
    <section className="actions">
      {children}
      <div className="actions-head">
        <h2>{me}’s actions</h2>
        <Switch on={s.actionsNewStep} onToggle={s.toggleActionsNewStep} title="When on, each action is added as a new step, named for you">
          New step for each action
        </Switch>
      </div>

      <div className="action-row">
        <span>Distance</span>
        <div className="buttons">
          {measures.map(([measure, text, title]) => (
            <button key={measure} className="small" title={title} onClick={() => run({ kind: 'distance', measure })}>
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="action-row">
        <span>Feet</span>
        <div className="buttons">
          {FEET.map(([move, text]) => (
            <button key={move} className="small" title={`${me}: ${text.toLowerCase()}`} onClick={() => run({ kind: 'footwork', move })}>
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="action-row">
        <span>Blade</span>
        <div className="buttons">
          <button className="small" title={`${me} straightens the arm, point toward ${opp}`} onClick={() => run({ kind: 'extend' })}>
            Extend
          </button>
          {LINES.map(([line, n]) => (
            <button
              key={`beat-${line}`}
              className="small"
              title={`${me} beats ${opp}’s blade in ${line} (${n}), knocking it to ${me}’s ${line === 'sixte' ? 'outside' : 'inside'}`}
              onClick={() => run({ kind: 'beat', line })}
            >
              Beat {n}
            </button>
          ))}
          {LINES.map(([line, n]) => (
            <button
              key={`engage-${line}`}
              className="small"
              title={`${me} takes ${opp}’s blade in ${line} (${n}): it is held on ${me}’s ${line === 'sixte' ? 'outside' : 'inside'}`}
              onClick={() => run({ kind: 'engage', line })}
            >
              Engage {n}
            </button>
          ))}
        </div>
      </div>

      <div className="action-row">
        <span>Parry</span>
        <div className="buttons">
          {PARRIES.map(([number, name]) => (
            <button
              key={number}
              className="small num"
              title={`${me} parries ${number} (${name})`}
              onClick={() => run({ kind: 'parry', number })}
            >
              {number}
            </button>
          ))}
        </div>
      </div>

      <div className="action-row">
<span>Hit {opp}</span>
        <div>
          <div className="hit-with">
            <span>with</span>
            <Toggle label={`${me} hits with`} bare value={s.hitWith} options={hitWith} onChange={s.setHitWith} />
          </div>
          <div className="buttons">
            {(Object.keys(TARGET_NAMES) as TargetArea[]).map((area) => (
              <button
                key={area}
                className="small"
                title={`${me} hits ${opp}’s ${TARGET_NAMES[area].toLowerCase()}${s.hitWith === 'arm' ? '' : s.hitWith === 'lunge' ? ' with a lunge' : ' with a flèche'}`}
                onClick={() => run({ kind: 'hit', area, with: s.hitWith })}
              >
                {TARGET_NAMES[area]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {message && <p className="message">{message}</p>}

      <div className="action-row">
        <span>Path in</span>
        <div className="buttons">
          {paths.map(([shape, text, title]) => (
            <button
              key={shape}
              className="small"
              disabled={first}
              title={first ? 'A path needs a step before it' : `${title} (into step ${s.stepIndex + 1})`}
              onClick={() => s.shapeActivePath(shape)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
