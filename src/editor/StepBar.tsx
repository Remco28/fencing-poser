import { useEffect, useRef, useState } from 'react';
import { isShaped } from '../model/combination.ts';
import { Switch } from '../ui/Switch.tsx';
import { keyAt } from '../viewer/player.ts';
import { useEditor } from './store.ts';

/**
 * The combination as a row of steps along the bottom of the stage: play it,
 * move between steps, add one. What can be done to a step (move, delete,
 * motion only) is in the ⋯ menu on the step you are on.
 */
export function StepBar() {
  const s = useEditor();
  const steps = s.combination.steps;
  const last = steps.length - 1;
  const playing = !!s.preview;
  const running = !!s.preview?.playing;
  const shownIndex = s.preview ? keyAt(s.combination, s.preview.pos) : s.stepIndex;

  return (
    <nav className="step-bar" aria-label="Steps">
      {steps.length > 1 && (
        <input
          className="scrubber"
          type="range"
          min={0}
          max={last}
          step={0.01}
          value={s.preview ? s.preview.pos : s.stepIndex}
          onChange={(e) => s.scrubTo(Number(e.target.value))}
          aria-label="Timeline: drag to see the movement between steps"
          title="Drag to see the movement between steps"
        />
      )}
      <div className="step-row">
        <button
          className={`play${running ? ' on' : ''}`}
          onClick={running ? s.stopPreview : s.startPreview}
          disabled={steps.length < 2}
          title={running ? 'Stop (Space)' : 'Play the combination smoothly from here (Space)'}
        >
          {running ? '■ Stop' : '▶ Play'}
        </button>
        <Switch on={s.loop} onToggle={s.toggleLoop} title="Play round and round">
          Loop
        </Switch>
        {playing && !running && (
          <button className="quiet" onClick={s.stopPreview} title="Back to editing (Esc)">
            Done
          </button>
        )}
        <span className="divider" />
        <button className="nav" onClick={() => s.goToStep(s.stepIndex - 1)} disabled={s.stepIndex === 0 || playing} title="Previous step (,)" aria-label="Previous step">
          ‹
        </button>
        <ol>
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
                  {isShaped(step) ? '⤳' : '→'}
                </button>
              )}
              <div className={`step-chip${i === shownIndex ? ' on' : ''}${step.motionOnly ? ' via' : ''}`}>
                <button
                  className="go"
                  aria-current={i === shownIndex ? 'step' : undefined}
                  title={step.motionOnly ? 'Motion only: shapes smooth playback, skipped when stepping' : undefined}
                  onClick={() => {
                    if (playing) s.stopPreview();
                    s.goToStep(i);
                  }}
                >
                  <span className="num">{i + 1}</span>
                  {step.label || <span className="untitled">{step.motionOnly ? 'via' : 'Untitled'}</span>}
                </button>
                {i === s.stepIndex && !playing && <StepMenu index={i} last={last} />}
              </div>
            </li>
          ))}
        </ol>
        <button className="nav" onClick={() => s.goToStep(s.stepIndex + 1)} disabled={s.stepIndex === last || playing} title="Next step (.)" aria-label="Next step">
          ›
        </button>
        <span className="divider" />
        <button className="primary" onClick={s.addStep} disabled={playing} title="Add a step after this one, starting from this pose (N)">
          + New step
        </button>
      </div>
    </nav>
  );
}

function StepMenu({ index, last }: { index: number; last: number }) {
  const s = useEditor();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [at, setAt] = useState({ left: 0, bottom: 0 });
  const box = useRef<HTMLDivElement>(null);
  const step = s.combination.steps[index];

  useEffect(() => {
    if (!open) return;
    setConfirm(false);
    const r = box.current!.getBoundingClientRect();
    setAt({ left: Math.max(8, Math.min(r.left - 160, window.innerWidth - 250)), bottom: window.innerHeight - r.top + 6 });
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const act = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div className="step-more" ref={box}>
      <button className="more" aria-label={`Step ${index + 1} options`} aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <div className="menu" role="menu" style={{ left: at.left, bottom: at.bottom, top: 'auto' }}>
          {!confirm ? (
            <>
              <button role="menuitem" disabled={index === 0} onClick={() => act(() => s.moveStep(-1))}>
                ← Move this step earlier
              </button>
              <button role="menuitem" disabled={index === last} onClick={() => act(() => s.moveStep(1))}>
                Move this step later →
              </button>
              {index > 0 && (
                <button role="menuitem" onClick={() => act(() => s.editPath(index))}>
                  Shape the movement into this step…
                </button>
              )}
              {step.motionOnly && (
                <button role="menuitem" onClick={() => act(() => s.setStepOptions({ motionOnly: false }))}>
                  Make it a normal step
                </button>
              )}
              <button role="menuitem" className="danger" disabled={last === 0} onClick={() => setConfirm(true)}>
                Delete this step…
              </button>
            </>
          ) : (
            <>
              <p>Delete step {index + 1}? Undo (Ctrl+Z) brings it back.</p>
              <div className="buttons">
                <button className="danger-solid" onClick={() => act(s.deleteStep)}>
                  Delete
                </button>
                <button onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
