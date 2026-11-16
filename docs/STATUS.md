# Status

Where the app is now, where each part lives, and what comes next. Update this with every round of work. Decisions and their reasons are in [DECISIONS.md](DECISIONS.md); the original plan is in [DESIGN.md](DESIGN.md).

**Live:** https://remco28.github.io/fencing-poser/ (republished on every push to `main`)
**Last updated:** 2026-11-16 (the simplify pass: see Next)

## The rule for every round

Before adding anything, look at what exists: can something be deleted, merged, or made clearer? Every option must earn its place. (See the guiding principle in DECISIONS.md.)

## What is built

### Posing
- **Mannequin**: 17 joints with anatomical angles and human limits; height, build, handedness, grip per fencer. `src/model/joints.ts`, `src/rig/`
- **Sketch**: a flat stick-figure strip under the 3D view (Side, Above, Behind; `K` shows or hides it; drag the divider to resize). It is the same two fencers, not a separate drawing: every joint is a dot to drag, the 3D view follows live, and a marker under each fencer slides them along the piste with the distance between front feet shown. From behind, only the opponent's blade is drawn. `src/sketch/`
- **Dots** (the sketch and the 3D handles share them): hips, chest, head, hands, elbows, feet, knees, point. A dot goes where it is dragged: a hand or foot pulled past its reach brings the body (hips slide and sink, feet planted); the point turns the wrist first, then moves the hand; elbows and knees turn the limb about its ends. `src/ik/drag.ts`, `src/ik/ik.ts`, `src/ik/Handles.tsx`
- **Keep in place**: switches for Feet (on by default), Hand, Point. Whatever is kept stays where it is while anything else moves, by drag or by key. `src/ik/drag.ts` (`keepInPlace`)
- **Help with the blade** (all that is left of the one-click actions): bring the point to a target with the arm alone; lay the blade against the opponent's, theirs on the inside or the outside, the opponent not moving; send the path in under or over their blade. No labels or highlights come with them. `src/editor/ActionsPanel.tsx`, store `pointTo` / `touchBlades` / `shapeActivePath`
- **Keyboard**: Tab / A D · S W · Q E / Shift / Alt / X / R and more (full list in the Help tab). `src/editor/keyboard.ts`
- **Controls beside the joint** (the only joint controls): keys and arrows per movement, click a value to type an angle, a position row for the hips, Straighten; coloured motion paths with key tags; a **thumb clock** for the wrist; stomach and chest bend as **one spine** by default. `src/editor/JointHud.tsx`, `MotionGuides.tsx`, `ThumbDial.tsx`
- **Your poses**: the coach's own saved poses, in the tray. Save is one click (named "Pose 3", typed over at once); a click puts a pose back on either fencer, whole, where they stand; ⋯ renames, replaces or deletes (with Undo). The only ready-made pose is Reset to en garde. `src/editor/PresetsPanel.tsx`, store `saveCurrentAsPreset` / `applyPreset` / `resetPose`
- **Blades**: blades push each other aside when a pose brings them together; `layAgainst` lays one against the other for Blades touch; `armTo` brings the point onto a target. `src/ik/blades.ts`
- **Balance**: centre of mass from a segment-mass model; an "off balance" mark appears under a fencer whose centre lies outside the feet (editor only). `src/rig/balance.ts`, `src/scene/BalanceMark.tsx`

### Combinations
- **Steps** with label, notes, targets and timing; new steps copy the current one; the storyboard along the bottom shows each step as a picture, with Play and a ⋯ card per step (label, notes, targets, timing, order). `src/editor/Storyboard.tsx`, `src/editor/thumbs.tsx`, `src/model/combination.ts`
- **Managing combinations**: ⋯ beside the title makes a new one, duplicates or deletes the open one, or opens another, without going back to the desk; on the desk each row has its own ⋯ (rename in place, duplicate and open, delete). `src/editor/TopBar.tsx` (`CombinationMenu`), `src/editor/Desk.tsx`
- **Path shaping**: click the arrow between two steps (or, with Ghost on, the "Shape the path" button or the red trail) and grab a point's red path anywhere to bend the movement (e.g. under the blade), pinning it in up to three places (double-click a ring to remove it); stored as pins (`Step.pins`: a moment and a change to the arm's joints), carried through by a smooth spline so the point glides. `src/ik/path.ts`, `src/ik/PathHandles.tsx`, `src/model/tween.ts`
- **Undo/redo** for every change; a drag or a held key undoes as one step. `src/editor/store.ts`
- **Camera**: one rule: the view moves only when the coach moves it, playing or not (drag turns, right-drag pans, scroll zooms to the pointer; Side, Above, Behind and Fit). Students watch the whole combination from one view, chosen with Students’ view → Students watch from here (written to every step; without one they get the side view). No lock, no view per step. `src/scene/CameraRig.tsx`, `FitRig.tsx`, store `setShot` / `showShot` / `clearShot`, `studentsView`
- **Show**: distances (feet, point to opponent, "Touch"), ghost of the previous step, labels. `src/scene/measure.ts`
- **Play** in the editor (Space), a **timeline** to scrub between steps, and **Loop**. Between two steps the **feet step by themselves** instead of skating: a foot that ends where it began stays planted, two travelling feet go one at a time (the leading foot first) with a small lift, one travelling foot swings across the move, and the hips sink if a leg could not reach. The same frames are used by the student viewer and the video. `src/viewer/gait.ts`, `src/viewer/player.ts`, `src/editor/Storyboard.tsx`
- **Point trail** with the ghost and while shaping a path. `src/scene/PointTrail.tsx`
- **First-run tour** (four cards; Help → Show the quick tour again). `src/editor/Tour.tsx`

### Look and layout
- **The scene**: a pale desk in daylight, a felt-topped board for the piste, fencer A in light wood and B in dark. Every scene colour is in `src/design.ts`; textures are drawn in code. `src/scene/Environment.tsx`, `Piste.tsx`, `textures.ts`, `src/rig/Mannequin.tsx`
- **The desk** on opening: the coach's combinations as a searchable list with a picture each, New combination, and Manage for the rest of the library. `src/editor/Desk.tsx`
- **The editor**: the 3D view fills the window; over it, the top bar (title, views, Show, Students’ view, Sketch, undo, History, Help, Share), the tray of the fencer being posed, the sketch sheet and the storyboard. What shows depends on what is selected. `src/editor/Editor.tsx`, `TopBar.tsx`, `Tray.tsx`, `ui.ts` (screen state), `views.ts`, `src/scene/ClearView.tsx`
- **One style sheet** built on a short list of named values, with Inter and Fraunces bundled. `src/styles.css`, `src/ui/` (Icon, Popover, Switch, Toggle)

### Library and sharing
- **Library**: autosave in the browser, collections, search, sort, export selected, import with newest-wins merge, folder sync with 14 daily snapshots, persistent storage. `src/library/`, `src/editor/LibraryDialog.tsx`
- **Share**: a link that carries the combination, with a QR code; the read-only student viewer (Steps / Smooth, phone-friendly). `src/share/link.ts`, `src/viewer/`
- **Export**: captioned picture, PDF handout (two steps per page), video of smooth playback, combination file. `src/export/`

### Quality
- 322 unit tests (including 1,000 random poses that must stay above the floor) (anatomy directions, IK, dragging, actions, blades, playback, links, merging, store); run `npm test`.
- Visual checks are done in a headless browser through a dev-only `window.__editor` hook.

## Testing with people

- **Round 1:** `human_feedback/round-2026-10-13-first-coach-test/index.html`, a guide and feedback form (opens offline in a browser). The tester exports `human-feedback-round-2026-10-13-first-coach-test.zip` and puts it beside the guide; the next agent reads it (see the office's human-feedback workflow).

## Next

- **The simplify pass (2026-11-16) is live and untested by the coach.** It was pushed straight to the site with no review round, at the coach's request: he tries it first, then it is fixed. It cut the ready-made poses, most one-click actions, the distance buttons, the view lock and the view per step; it added automatic footwork in playback, one-click saved poses and the combination menus.
- Once the coach confirms the direction: delete what the app no longer reaches (in `src/actions/actions.ts`: footwork, distance, parry, engage, beat, extend, hits with a lunge or flèche, the labels; they are still exercised by tests) and the built-in poses other than en garde (`src/presets/builtin.ts`).
- Review the pass (it has had the author's tests and a browser check only).
- **The look is settled (2026-11-16); more visual work is for another time.** Known and left for then: the PDF handout still uses Helvetica, not the app's fonts; the top bar wraps to two rows in a window narrower than about 1100 px; nothing has been tried on a real phone.

## Deliberately not done

| Item | Why |
|---|---|
| Sound and timing marks | Not needed yet (coach). |
| GIF export | The video covers it. |
| Quinte preset | Definition undecided; can be a custom pose. |
| Arms and bodies pushing each other | They bend too many ways to guess; blades only. |
| Foil and sabre | Épée first. |
| Soft joint limits, flexibility setting | Every joint already has limits; widen one if a real position is blocked. |
| Automatic balancing | Warn only; correcting would fight the coach, and some actions are off balance on purpose. |
| Arrows | The point trail shows the movement; arrows would be one more thing to place by hand. |
| "Motion only" steps | Replaced by path shaping; still played in old combinations, no longer offered. |
| Moving a whole arm as one | The hand drag already moves the whole arm; only the spine needed it. |
| Ready-made poses, parries and footwork buttons, distance buttons, "new step for each action", the pose dial, part-of-a-pose, pose from another step | Removed 2026-11-16: in real use they saved no time and the ready-made poses were off; the coach poses by hand and saves his own. |
| Locking the view; a different students' view per step | Removed 2026-11-16: confusing and hard to keep up. The coach's view never moves by itself; students get one view. Old combinations with a view per step still play as saved. |
| Pose from a photo or video | Possible in the browser, but the coach wants the sketch and actions first. |
| Uploading drawn stick figures | A program would have to guess which line is which limb, with no depth; dragging dots on the figure that is already there is quicker. |
| Flat camera views in the 3D scene | The Side / Behind / Overhead buttons also set what students see; a strip beside the 3D view avoids overwriting that. |
| Dragging the sticks themselves | Dots cover it; a stick drag would need a second rule to learn. |

## Known rough edges

- Automatic footwork is new and judged only by tests: an advance, a retreat and a lunge step as described above, but a jump or a balestra (both feet at once) is shown as two steps, and a pose with the fencer lifted off the floor is left as posed.
- A path bent before 2026-11-16 keeps its bends, but the point may pass a few centimetres from where it did, because the body now moves differently between the steps.

- A hit on a target nearer than a folded arm can manage (the opponent's hand or arm with the toes under about 40 cm apart) cannot land; the app says it is too close rather than stepping the fencer back.
- From above, the sketch draws the fencers small, because the piste is long.
- With the sketch open on a small screen the 3D view is short; Fit both (Z) reframes it.
- Video length can drift on a machine that renders very slowly (it follows real time).
- Libraries do not move between sites: the copy on `localhost` and the one on GitHub Pages are separate browsers' storage as far as the browser is concerned. Move work with Library → Back up everything → Import, or point both at the same sync folder.
