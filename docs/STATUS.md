# Status

Where the app is now, where each part lives, and what comes next. Update this with every round of work. Decisions and their reasons are in [DECISIONS.md](DECISIONS.md); the original plan is in [DESIGN.md](DESIGN.md).

**Live:** https://remco28.github.io/fencing-poser/ (republished on every push to `main`)
**Last updated:** 2026-10-13

## The rule for every round

Before adding anything, look at what exists: can something be deleted, merged, or made clearer? Every option must earn its place. (See the guiding principle in DECISIONS.md.)

## What is built

### Posing
- **Mannequin**: 17 joints with anatomical angles and human limits; height, build, handedness, grip per fencer. `src/model/joints.ts`, `src/rig/`
- **Drag-to-pose**: handles on hands, point, feet, hips; exact two-bone IK, feet stay planted when the hips move. `src/ik/ik.ts`, `src/ik/Handles.tsx`
- **Keyboard**: Tab / A D · S W · Q E / Shift / Alt / X / R and more (full list in the Help tab). `src/editor/keyboard.ts`
- **Controls beside the joint** (the only joint controls): keys and arrows per movement, click a value to type an angle, a position row for the hips, Straighten; coloured motion paths with key tags; a **thumb clock** for the wrist; stomach and chest bend as **one spine** by default. `src/editor/JointHud.tsx`, `MotionGuides.tsx`, `ThumbDial.tsx`
- **Presets**: footwork, seven parries, body evasions, and the coach's own, each with a ⋯ menu (apply to the other fencer, replace, rename, delete or restore); apply to the whole body, arms and torso, or legs. `src/presets/`, `src/editor/PresetsPanel.tsx`
- **Blades**: engage in sixte or quarte, touch a target (the body leans in if the arm falls short, never past balanced), blades push each other aside. `src/ik/blades.ts`
- **Balance**: centre of mass from a segment-mass model; an "off balance" mark appears under a fencer whose centre lies outside the feet (editor only). `src/rig/balance.ts`, `src/scene/BalanceMark.tsx`

### Combinations
- **Steps** with label, notes, targets and timing; new steps copy the current one; the step bar with Play and a ⋯ menu per step. `src/editor/StepBar.tsx`, `src/model/combination.ts`
- **Path shaping**: click the arrow between two steps (or, with Ghost on, the "Shape the path" button or the red trail) and drag the ringed ball in the middle of a point's path to bend the movement (e.g. under the blade); stored as a halfway pose (`Step.via`) that playback curves through. `src/ik/path.ts`, `src/ik/PathHandles.tsx`, `src/model/tween.ts`
- **Undo/redo** for every change; a drag or a held key undoes as one step. `src/editor/store.ts`
- **Camera**: Side, Overhead, Behind A/B, Zoom to both / to one fencer, Lock, One view for all steps; each step keeps its view. `src/scene/CameraRig.tsx`, `FitRig.tsx`
- **Show**: distances (feet, point to opponent, "Touch"), ghost of the previous step, labels. `src/scene/measure.ts`
- **Play** in the editor (Space), a **timeline** to scrub between steps, and **Loop**. `src/editor/StepBar.tsx`, `src/scene/playback.tsx`, `src/viewer/player.ts`
- **Point trail** with the ghost and while shaping a path. `src/scene/PointTrail.tsx`
- **First-run tour** (four cards; Help → Show the quick tour again). `src/editor/Tour.tsx`

### Library and sharing
- **Library**: autosave in the browser, collections, search, sort, export selected, import with newest-wins merge, folder sync with 14 daily snapshots, persistent storage. `src/library/`, `src/editor/LibraryDialog.tsx`
- **Share**: a link that carries the combination, with a QR code; the read-only student viewer (Steps / Smooth, phone-friendly). `src/share/link.ts`, `src/viewer/`
- **Export**: captioned picture, PDF handout (two steps per page), video of smooth playback, combination file. `src/export/`

### Quality
- 99 unit tests (including 1,000 random poses that must stay above the floor) (anatomy directions, IK, blades, playback, links, merging, store); run `npm test`.
- Visual checks are done in a headless browser through a dev-only `window.__editor` hook.

## Testing with people

- **Round 1:** `human_feedback/round-2026-10-13-first-coach-test/index.html`, a guide and feedback form (opens offline in a browser). The tester exports `human-feedback-round-2026-10-13-first-coach-test.zip` and puts it beside the guide; the next agent reads it (see the office's human-feedback workflow).

## Next

Decided by the coach's feedback from round 1. Until then: keep trimming what the round shows is unused.

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

## Known rough edges

- The flèche, prime, stomach-tuck and lean-back presets are drafts; the coach may want to replace them.
- Video length can drift on a machine that renders very slowly (it follows real time).
- Libraries do not move between sites: the copy on `localhost` and the one on GitHub Pages are separate browsers' storage as far as the browser is concerned. Move work with Library → Back up everything → Import, or point both at the same sync folder.
