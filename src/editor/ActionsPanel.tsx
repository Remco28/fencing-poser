import { useEffect, useState } from 'react';
import type { PathShape } from '../actions/actions.ts';
import { TARGET_NAMES, type TargetArea } from '../model/combination.ts';
import { formatDistance } from '../model/units.ts';
import { useEditor } from './store.ts';

/**
 * Help with the blade, for the fencer being posed: bring the point to a
 * target, lay the blade against the opponent's, or send the point under or
 * over their blade on the way in. Everything else is posed by hand.
 */
export function ActionsPanel() {
  const s = useEditor();
  const [message, setMessage] = useState('');
  const me = s.active;
  const opp = me === 'A' ? 'B' : 'A';
  const first = s.stepIndex === 0;
  // A message is about one fencer in one step.
  useEffect(() => setMessage(''), [me, s.stepIndex]);

  const point = (area: TargetArea) => {
    const { short, close } = s.pointTo(area);
    const target = `${opp}’s ${TARGET_NAMES[area].toLowerCase()}`;
    if (!short) return setMessage('');
    if (close) return setMessage(`${target} is too close for ${me}’s point to land: the arm went as far as it could.`);
    setMessage(`${me}’s point is ${formatDistance(short, s.units)} short of ${target}: the arm alone does not reach.`);
  };
  const touch = (where: 'inside' | 'outside') =>
    setMessage(s.touchBlades(where) ? '' : 'The blades are too far apart to meet: bring them closer first.');

  const paths: [PathShape, string, string][] = [
    ['direct', 'Direct', 'The plain movement'],
    ['under', 'Under', `A disengage: the point passes under ${opp}’s blade`],
    ['over', 'Over', `A cut-over: the point passes over ${opp}’s point`],
  ];

  return (
    <section className="actions">
      <div className="actions-head">
        <h2>{me}’s blade</h2>
      </div>

      <div className="action-row">
        <span title={`Bring ${me}’s point to a target on ${opp}`}>Point to</span>
        <div className="buttons">
          {(Object.keys(TARGET_NAMES) as TargetArea[]).map((area) => (
            <button
              key={area}
              className="small"
              title={`Bring ${me}’s point to ${opp}’s ${TARGET_NAMES[area].toLowerCase()}, with the arm only: the feet stay where they are`}
              onClick={() => point(area)}
            >
              {TARGET_NAMES[area]}
            </button>
          ))}
        </div>
      </div>

      <div className="action-row">
        <span>Blades</span>
        <div className="buttons">
          <button className="small" title={`${me}’s blade is laid against ${opp}’s, with ${opp}’s blade on ${me}’s inside (as in 4). ${opp} does not move.`} onClick={() => touch('inside')}>
            Touch inside
          </button>
          <button className="small" title={`${me}’s blade is laid against ${opp}’s, with ${opp}’s blade on ${me}’s outside (as in 6). ${opp} does not move.`} onClick={() => touch('outside')}>
            Touch outside
          </button>
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
