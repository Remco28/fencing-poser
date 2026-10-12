import { useEditor } from './store.ts';

/** The combination as a row of steps along the bottom of the stage. */
export function StepBar() {
  const s = useEditor();
  const steps = s.combination.steps;
  const last = steps.length - 1;

  return (
    <nav className="step-bar" aria-label="Steps">
      <button onClick={() => s.goToStep(s.stepIndex - 1)} disabled={s.stepIndex === 0} title="Previous step (,)">
        ‹ Prev
      </button>
      <ol>
        {steps.map((step, i) => (
          <li key={step.id}>
            <button
              className={i === s.stepIndex ? 'on' : ''}
              aria-current={i === s.stepIndex ? 'step' : undefined}
              onClick={() => s.goToStep(i)}
            >
              <span className="num">{i + 1}</span>
              {step.label || <span className="untitled">Untitled</span>}
            </button>
          </li>
        ))}
      </ol>
      <button onClick={() => s.goToStep(s.stepIndex + 1)} disabled={s.stepIndex === last} title="Next step (.)">
        Next ›
      </button>
      <span className="divider" />
      <button onClick={s.addStep} title="New step after this one, starting from this pose (N)">
        + New step
      </button>
      <button onClick={() => s.moveStep(-1)} disabled={s.stepIndex === 0} title="Move this step earlier">
        ←
      </button>
      <button onClick={() => s.moveStep(1)} disabled={s.stepIndex === last} title="Move this step later">
        →
      </button>
      <button onClick={s.deleteStep} disabled={steps.length < 2} title="Delete this step (undo brings it back)">
        Delete
      </button>
    </nav>
  );
}
