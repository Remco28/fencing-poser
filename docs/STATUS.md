# Status

Where the app is now, where each part lives, and what comes next. Update this with every round of work. Decisions and their reasons are in [DECISIONS.md](DECISIONS.md); the original plan is in [DESIGN.md](DESIGN.md).

**Live:** https://remco28.github.io/fencing-poser/ (republished on every push to `main`)
**Last updated:** 2026-11-15

## The rule for every round

Before adding anything, look at what exists: can something be deleted, merged, or made clearer? Every option must earn its place. (See the guiding principle in DECISIONS.md.)

## What is built

### Posing
- **Mannequin**: 17 joints with anatomical angles and human limits; height, build, handedness, grip per fencer. `src/model/joints.ts`, `src/rig/`
- **Sketch**: a flat stick-figure strip under the 3D view (Side, Above, Behind; `K` shows or hides it; drag the divider to resize). It is the same two fencers, not a separate drawing: every joint is a dot to drag, the 3D view follows live, and a marker under each fencer slides them along the piste with the distance between front feet shown. From behind, only the opponent's blade is drawn. `src/sketch/`
- **Dots** (the sketch and the 3D handles share them): hips, chest, head, hands, elbows, feet, knees, point. A dot goes where it is dragged: a hand or foot pulled past its reach brings the body (hips slide and sink, feet planted); the point turns the wrist first, then moves the hand; elbows and knees turn the limb about its ends. `src/ik/drag.ts`, `src/ik/ik.ts`, `src/ik/Handles.tsx`
- **Keep in place**: switches for Feet (on by default), Hand, Point. Whatever is kept stays where it is while anything else moves, by drag or by key. `src/ik/drag.ts` (`keepInPlace`)
- **Actions**: one click per fencing action for the posing fencer: distance (short, medium, long), footwork (advance, retreat, half lunge, lunge, recover, flèche), extend, beat 4/6, engage 4/6, parries 1–8, hit a target with the arm, a lunge or a flèche, and the path in (direct, under the blade, over the blade). "New step for each action" adds and names the step. `src/actions/actions.ts`, `src/editor/ActionsPanel.tsx`
- **Keyboard**: Tab / A D · S W · Q E / Shift / Alt / X / R and more (full list in the Help tab). `src/editor/keyboard.ts`
- **Controls beside the joint** (the only joint controls): keys and arrows per movement, click a value to type an angle, a position row for the hips, Straighten; coloured motion paths with key tags; a **thumb clock** for the wrist; stomach and chest bend as **one spine** by default. `src/editor/JointHud.tsx`, `MotionGuides.tsx`, `ThumbDial.tsx`
- **Presets**: footwork, seven parries, body evasions, and the coach's own, each with a ⋯ menu (apply to the other fencer, replace, rename, delete or restore); apply to the whole body, arms and torso, legs, or the weapon arm alone; a dial sets how far the last pose goes (halfway to a lunge); a fencer's pose can be taken from another step, or from the other fencer. `src/presets/`, `src/editor/PresetsPanel.tsx`, store `setPoseAmount` / `applyStepPose`
- **Blades**: a parry, engagement or beat carries the opponent's blade to that line's side, strong against weak (`layAgainst`); a hit brings the point onto a target (the body leans in if the arm falls short, never past balanced); otherwise blades push each other aside. `src/ik/blades.ts`
- **Balance**: centre of mass from a segment-mass model; an "off balance" mark appears under a fencer whose centre lies outside the feet (editor only). `src/rig/balance.ts`, `src/scene/BalanceMark.tsx`

### Combinations
- **Steps** with label, notes, targets and timing; new steps copy the current one; the storyboard along the bottom shows each step as a picture, with Play and a ⋯ card per step (label, notes, targets, timing, order). `src/editor/Storyboard.tsx`, `src/editor/thumbs.tsx`, `src/model/combination.ts`
- **Path shaping**: click the arrow between two steps (or, with Ghost on, the "Shape the path" button or the red trail) and grab a point's red path anywhere to bend the movement (e.g. under the blade), pinning it in up to three places (double-click a ring to remove it); stored as pins (`Step.pins`: a moment and a change to the arm's joints), carried through by a smooth spline so the point glides. `src/ik/path.ts`, `src/ik/PathHandles.tsx`, `src/model/tween.ts`
- **Undo/redo** for every change; a drag or a held key undoes as one step. `src/editor/store.ts`
- **Camera**: drag turns, right-drag pans, scroll zooms to the pointer; Side, Above, Behind (the fencer being posed) and Fit, each framed within the part of the window not under a panel; Lock under Show. The working view is the coach's own; what students see for a step is set on purpose (the Students’ view button in the top bar: use this view, go to it, clear it, One view for all steps). `src/scene/CameraRig.tsx`, `FitRig.tsx`, store `setShot` / `showShot` / `clearShot`
- **Show**: distances (feet, point to opponent, "Touch"), ghost of the previous step, labels. `src/scene/measure.ts`
- **Play** in the editor (Space), a **timeline** to scrub between steps, and **Loop**. `src/editor/Storyboard.tsx`, `src/scene/playback.tsx`, `src/viewer/player.ts`
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

- The coach tries the sketch and the actions on real phrases; fix what reads wrong as fencing (see Known rough edges).
- Later, if wanted: typing a phrase ("A: beat 6, disengage, lunge to the hand") to draft the steps; a drawing or photo behind the sketch to trace.

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
| Pose from a photo or video | Possible in the browser, but the coach wants the sketch and actions first. |
| Uploading drawn stick figures | A program would have to guess which line is which limb, with no depth; dragging dots on the figure that is already there is quicker. |
| Flat camera views in the 3D scene | The Side / Behind / Overhead buttons also set what students see; a strip beside the 3D view avoids overwriting that. |
| Dragging the sticks themselves | Dots cover it; a stick drag would need a second rule to learn. |

## Known rough edges

- The flèche, prime, stomach-tuck and lean-back presets are drafts; the coach may want to replace them.
- The named distances sit close together (front feet 0.86 m, 1.31 m and 1.66 m apart for two 1.78 m fencers) because the lunge preset only carries the front foot 0.53 m. They are worked out from the Lunge pose, so replacing that pose with a deeper lunge moves them.
- A low parry (2, 7, 8) chosen against a high attack does not find the blade, and a parry in a lunge is low because the whole body is.
- A hit on a target nearer than a folded arm can manage (the opponent's hand or arm with the toes under about 40 cm apart) cannot land; the app says it is too close rather than stepping the fencer back.
- A known old bug is filed in `BUGS.md`: clicking a pose the fencer already holds adds a history entry that changes nothing.
- Three small known problems from the last review round are filed in `BUGS.md` (two view saves within a second undo as one; Space pressed mid-drag in the sketch; the "held back" line lingering after a pose click).
- After a beat the blades stay in contact (the picture is the moment of the beat); a flèche hit from the en garde lines needs nearly its 3 m limit.
- From above, the sketch draws the fencers small, because the piste is long.
- With the sketch open on a small screen the 3D view is short; Fit both (Z) reframes it.
- Video length can drift on a machine that renders very slowly (it follows real time).
- Libraries do not move between sites: the copy on `localhost` and the one on GitHub Pages are separate browsers' storage as far as the browser is concerned. Move work with Library → Back up everything → Import, or point both at the same sync folder.
