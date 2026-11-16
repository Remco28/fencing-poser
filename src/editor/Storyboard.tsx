import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FENCERS, isShaped, TARGET_NAMES, type Step, type TargetArea } from '../model/combination.ts';
import { Icon, PlayIcon } from '../ui/Icon.tsx';
import { Popover } from '../ui/Popover.tsx';
import { touchOf } from '../model/touch.ts';
import { keyAt } from '../viewer/player.ts';
import { hasShot, useEditor } from './store.ts';
import { useThumbnail } from './thumbs.tsx';

/**
 * The combination as a row of pictures along the bottom: what is being made,
 * always in sight. Click a picture to go to that step, the arrow between two
 * to shape the movement, the last card to add a step. What can be done to a
 * step (its label, notes, order) is under ⋯ on the step you are on.
 */
export function Storyboard() {
  const s = useEditor();
  const steps = s.combination.steps;
  const last = steps.length - 1;
  const playing = !!s.preview;
  const running = !!s.preview?.playing;
  const shownIndex = s.preview ? keyAt(s.combination, s.preview.pos) : s.stepIndex;
  const list = useRef<HTMLOListElement>(null);
  // Play stays put; only the steps scroll, keeping the one shown in sight.
  useEffect(() => {
    list.current?.querySelector('.shot.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [shownIndex]);

  return (
    <nav className="board card" aria-label="Steps">
      {steps.length > 1 && (
        <input
          className="scrubber"
          type="range"
          min={0}
          max={last}
          step={0.01}
          value={s.preview ? s.preview.pos : s.stepIndex}
          style={{ '--at': `${((s.preview ? s.preview.pos : s.stepIndex) / last) * 100}%` } as CSSProperties}
          onChange={(e) => s.scrubTo(Number(e.target.value))}
          aria-label="Timeline: drag to see the movement between steps"
          title="Drag to see the movement between steps"
        />
      )}
      <div className="board-row">
        <div className="board-play">
          <button
            className="play"
            onClick={running ? s.stopPreview : s.startPreview}
            disabled={steps.length < 2}
            title={running ? 'Stop (Space)' : 'Play the combination smoothly from here (Space)'}
            aria-label={running ? 'Stop' : 'Play'}
          >
            <PlayIcon stop={running} />
          </button>
          {playing && !running ? (
            <button className="link" onClick={s.stopPreview} title="Back to editing (Esc)">
              Done
            </button>
          ) : (
            <button className="loop" aria-pressed={s.loop} onClick={s.toggleLoop} title="Play round and round">
              <Icon name="loop" /> Loop
            </button>
          )}
        </div>
        <ol ref={list}>
          {steps.map((step, i) => (
            <li key={step.id}>
              {i > 0 && (
                <button
                  className={`path-link${s.pathEdit && s.stepIndex === i ? ' on' : ''}${isShaped(step) ? ' shaped' : ''}`}
                  onClick={() => (s.pathEdit && s.stepIndex === i ? s.exitPath() : s.editPath(i))}
                  disabled={playing}
                  title={`Shape the movement from step ${i} to step ${i + 1}${isShaped(step) ? ' (shaped)' : ''}`}
                  aria-label={`Shape the movement from step ${i} to step ${i + 1}`}
                >
                  <Icon name={isShaped(step) ? 'curve' : 'arrow'} />
                </button>
              )}
              <Shot step={step} index={i} on={i === shownIndex} current={i === s.stepIndex && !playing} last={last} />
            </li>
          ))}
          <li>
            <button className="add-step" onClick={s.addStep} disabled={playing} title="Add a step after this one, starting from this pose (N)">
              <Icon name="plus" />
              New step
            </button>
          </li>
        </ol>
      </div>
    </nav>
  );
}

function Shot(props: { step: Step; index: number; on: boolean; current: boolean; last: number }) {
  const { step, index } = props;
  const fencers = useEditor((s) => s.combination.fencers);
  const goToStep = useEditor((s) => s.goToStep);
  const stopPreview = useEditor((s) => s.stopPreview);
  const picture = useThumbnail(fencers, step.poses);
  const touch = touchOf(step);
  const [menu, setMenu] = useState(false);
  return (
    <div className={`shot${props.on ? ' on' : ''}${step.motionOnly ? ' via' : ''}`}>
      <button
        className="pic"
        aria-current={props.on ? 'step' : undefined}
        title={step.motionOnly ? 'Motion only: shapes smooth playback, skipped when stepping' : `Step ${index + 1}${step.label ? `: ${step.label}` : ''}`}
        onClick={() => {
          if (useEditor.getState().preview) stopPreview();
          goToStep(index);
        }}
        onDoubleClick={() => setMenu(true)}
      >
        {picture && <img src={picture} alt="" draggable={false} />}
        {touch && <span className={`lamp ${touch === 'A' ? 'red' : 'green'}`} title={`${touch} hits`} />}
        {hasShot(step) && (
          <span className="badge" title="Students see this step from a view you chose">
            <Icon name="eye" />
          </span>
        )}
      </button>
      <div className="cap">
        <b>{index + 1}</b>
        <span className={step.label ? '' : 'untitled'}>{step.label || (step.motionOnly ? 'via' : 'Untitled')}</span>
        {props.current && (
          <Popover className="icon more" side="above" width={330} open={menu} onOpenChange={setMenu} title={`Step ${index + 1}: label, notes and more`} label={<Icon name="more" />}>
            {(close) => <StepCard index={index} last={props.last} close={close} />}
          </Popover>
        )}
      </div>
    </div>
  );
}

/** The step you are on: what students read with it, and what can be done to it. */
function StepCard({ index, last, close }: { index: number; last: number; close: () => void }) {
  const s = useEditor();
  const [confirm, setConfirm] = useState(false);
  const step = s.combination.steps[index];
  const act = (fn: () => void) => {
    fn();
    close();
  };
  if (confirm)
    return (
      <div className="step-card">
        <p>Delete step {index + 1}? Undo (Ctrl+Z) brings it back.</p>
        <div className="buttons">
          <button className="danger-solid" onClick={() => act(s.deleteStep)}>
            Delete
          </button>
          <button onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      </div>
    );
  return (
    <div className="step-card">
      <h2 className="caps">
        Step {index + 1} of {last + 1}
      </h2>
      <input
        aria-label="Step label"
        placeholder="Label, e.g. Feint disengage"
        value={step.label}
        onChange={(e) => s.setStepText({ label: e.target.value })}
      />
      <textarea
        aria-label="Notes for students"
        placeholder="Notes for students (optional)"
        rows={3}
        value={step.notes}
        onChange={(e) => s.setStepText({ notes: e.target.value })}
      />
      <h3>Mark a target</h3>
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
      <label className="inline">
        <span>Time to move into this step</span>
        <select value={step.durationMs ?? 1000} onChange={(e) => s.setStepOptions({ durationMs: Number(e.target.value) })} disabled={index === 0}>
          {[250, 500, 750, 1000, 1500, 2000, 3000].map((ms) => (
            <option key={ms} value={ms}>
              {ms / 1000} s
            </option>
          ))}
        </select>
      </label>
      <hr />
      <div className="menu-list">
        <button disabled={index === 0} onClick={() => act(() => s.moveStep(-1))}>
          <Icon name="back" /> Move earlier
        </button>
        <button disabled={index === last} onClick={() => act(() => s.moveStep(1))}>
          <Icon name="forward" /> Move later
        </button>
        {index > 0 && (
          <button onClick={() => act(() => s.editPath(index))}>
            <Icon name="curve" /> Shape the movement into this step
          </button>
        )}
        {step.motionOnly && <button onClick={() => act(() => s.setStepOptions({ motionOnly: false }))}>Make it a normal step</button>}
        <button className="danger" disabled={last === 0} onClick={() => setConfirm(true)}>
          <Icon name="trash" /> Delete this step…
        </button>
      </div>
    </div>
  );
}
