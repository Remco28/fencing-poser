import type { FencerId } from '../model/combination.ts';
import { Icon } from '../ui/Icon.tsx';
import { Popover } from '../ui/Popover.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Toggle } from '../ui/Toggle.tsx';
import { HistoryList } from './HistoryList.tsx';
import { STEP } from './keyboard.ts';
import { currentStep, hasShot, useEditor, viewIsShot } from './store.ts';
import { useUi } from './ui.ts';
import { lookAt } from './views.ts';

/** Along the top: the way back to the desk and the title; then the view, and what is done to the whole combination. */
export function TopBar(props: { onShare: () => void; onLibrary: () => void; onTour: () => void }) {
  const s = useEditor();
  const posing = useUi((u) => u.posing);
  const playing = !!s.preview;
  const still = s.cameraLocked || playing;
  const behind: FencerId = s.active;

  return (
    <header className="top-bar">
      <div className="bar card title-bar">
        <button className="icon" onClick={useUi.getState().goToDesk} title="Back to the desk and your other combinations" aria-label="Back to the desk">
          <Icon name="back" />
        </button>
        <input
          className="title"
          aria-label="Combination title"
          value={s.combination.title}
          size={Math.max(8, Math.min(40, s.combination.title.length + 1))}
          onChange={(e) => s.setTitle(e.target.value)}
        />
        <span className="divider" />
        {s.folder && !s.folder.ready ? (
          <button className="link" onClick={props.onLibrary}>
            Folder “{s.folder.name}” needs reconnecting
          </button>
        ) : (
          <span className="save-state" title={s.folder?.ready ? `Saved in this browser and in the folder “${s.folder.name}”` : 'Saved in this browser as you work'}>
            Saved
          </span>
        )}
      </div>

      <div className="top-right">
        <div className="bar card" role="toolbar" aria-label="View">
          <button className="flat" onClick={() => s.requestView(lookAt('side'))} disabled={still} title="Look from the side">
            Side
          </button>
          <button className="flat" onClick={() => s.requestView(lookAt('above'))} disabled={still} title="Look from above">
            Above
          </button>
          {posing && (
            <button
              className="flat"
              onClick={() => s.requestView(lookAt(behind === 'A' ? 'behindA' : 'behindB'))}
              disabled={still}
              title={`Look over ${behind}’s shoulder`}
            >
              Behind {behind}
            </button>
          )}
          <button className="flat" onClick={() => s.requestFit('both')} disabled={still} title="Bring both fencers into view (Z)">
            Fit
          </button>
          <span className="divider" />
          <ShowMenu />
          <StudentsMenu />
          <button
            className="flat"
            aria-pressed={s.sketch.open}
            onClick={s.toggleSketch}
            title="A flat stick-figure drawing under the view, where every joint can be dragged (K)"
          >
            <Icon name="pencil" /> Sketch
          </button>
        </div>

        <div className="bar card">
          <button className="icon" onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Icon name="undo" />
          </button>
          <button className="icon" onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Icon name="redo" />
          </button>
          <Popover className="icon" label={<Icon name="history" />} title="Every edit, to jump back to any of them" align="end" width={300}>
            <h2 className="caps">History</h2>
            <HistoryList />
          </Popover>
          <Popover className="icon" label={<Icon name="help" />} title="Help and settings" align="end" width={330}>
            {(close) => <Help onTour={() => (close(), props.onTour())} />}
          </Popover>
          <button className="primary" onClick={props.onShare} title="Share with students, or export a picture, handout or video">
            <Icon name="share" /> Share
          </button>
        </div>
      </div>
    </header>
  );
}

/** What is drawn in the view besides the fencers. */
function ShowMenu() {
  const s = useEditor();
  const display = currentStep(s).display ?? {};
  const first = s.stepIndex === 0;
  return (
    <Popover
      className="flat"
      label={
        <>
          <Icon name={s.cameraLocked ? 'lock' : 'eye'} /> Show
        </>
      }
      title="What is drawn in the view"
      align="end"
      width={270}
    >
      <div className="switch-list">
        <Switch on={!!display.distance} onToggle={() => s.setDisplay({ distance: !display.distance })} title="Distances for this step; students see them too">
          Distances on this step
        </Switch>
        <Switch
          on={!!display.ghost}
          onToggle={() => s.setDisplay({ ghost: !display.ghost })}
          disabled={first && !display.ghost}
          title={first ? 'The first step has nothing before it' : 'The previous step, faintly, and the path of each point since then'}
        >
          The step before, faintly
        </Switch>
        <Switch on={s.showLabels} onToggle={s.toggleLabels} title="The A and B tags above the fencers">
          A and B tags
        </Switch>
        <Switch on={s.handles} onToggle={s.toggleHandles} title="The dots to drag on the fencer being posed (H)">
          Dots to drag
        </Switch>
        <hr />
        <Switch on={s.cameraLocked} onToggle={s.toggleCameraLock} title="When on, the view cannot be moved by accident (L)">
          Lock the view
        </Switch>
      </div>
    </Popover>
  );
}

/** Where students see each step from: chosen on purpose, never by looking around. */
function StudentsMenu() {
  const s = useEditor();
  const step = currentStep(s);
  const onShot = viewIsShot(s);
  const chosen = hasShot(step);
  const playing = !!s.preview;
  const all = !!s.combination.sharedView;
  const what = all ? 'every step' : `step ${s.stepIndex + 1}`;
  return (
    <Popover
      className="flat"
      label={
        <>
          <span className={`mark${chosen ? ' on' : ''}`} aria-hidden />
          Students’ view
        </>
      }
      title="Where students see this step from"
      align="end"
      width={300}
    >
      <p className="hint">
        Students see {what} from the view you choose here. Looking around while you work never changes it.{' '}
        {chosen ? '' : 'Nothing chosen yet: they get the side view.'}
      </p>
      <div className="stack">
        <button className="primary" onClick={s.setShot} disabled={playing || onShot}>
          {onShot ? (
            <>
              <Icon name="check" /> Students see {what} from here
            </>
          ) : (
            <>Use this view for {what}</>
          )}
        </button>
        <button onClick={s.showShot} disabled={playing || s.cameraLocked || onShot || !chosen}>
          Go to the students’ view
        </button>
        <button className="quiet" onClick={s.clearShot} disabled={playing || !chosen}>
          Back to the side view for students
        </button>
      </div>
      <hr />
      <div className="switch-list">
        <Switch on={all} onToggle={s.toggleSharedView} title="When on, students see every step from the same view">
          One view for all steps
        </Switch>
      </div>
    </Popover>
  );
}

function Help({ onTour }: { onTour: () => void }) {
  const s = useEditor();
  return (
    <div className="help">
      <button onClick={onTour}>Show the quick tour again</button>
      <Toggle
        label="Units"
        value={s.units}
        options={[
          ['metric', 'Metric'],
          ['imperial', 'Imperial'],
        ]}
        onChange={s.setUnits}
      />
      <h2 className="caps">Mouse</h2>
      <dl className="keys">
        <dt>Drag</dt>
        <dd>Turn the view</dd>
        <dt>Right-drag</dt>
        <dd>Slide the view</dd>
        <dt>Scroll</dt>
        <dd>Zoom toward the pointer</dd>
      </dl>
      <h2 className="caps">Keys</h2>
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
        <dt>Space</dt>
        <dd>Play / stop</dd>
        <dt>Ctrl+Z / Ctrl+Shift+Z</dt>
        <dd>Undo / redo</dd>
        <dt>K</dt>
        <dd>Show / hide the sketch</dd>
        <dt>H</dt>
        <dd>Show / hide the dots to drag</dd>
        <dt>Z / Shift+Z</dt>
        <dd>Fit both fencers / the one being posed</dd>
        <dt>L</dt>
        <dd>Lock / unlock the view</dd>
        <dt>Esc</dt>
        <dd>Let go: of the joint, then of the fencer</dd>
      </dl>
    </div>
  );
}
