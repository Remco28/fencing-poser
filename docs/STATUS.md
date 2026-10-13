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
- **Controls beside the joint**, with coloured motion paths and key tags, and a **thumb clock** for the wrist. `src/editor/JointHud.tsx`, `MotionGuides.tsx`, `ThumbDial.tsx`
- **Presets**: footwork, seven parries, body evasions, and the coach's own, each with a ⋯ menu (apply to the other fencer, replace, rename, delete or restore); apply to the whole body, arms and torso, or legs. `src/presets/`, `src/editor/PresetsPanel.tsx`
- **Blades**: engage in sixte or quarte, touch a target (the body leans in if the arm falls short, never past balanced), blades push each other aside. `src/ik/blades.ts`
- **Balance**: centre of mass from a segment-mass model; an "off balance" mark appears under a fencer whose centre lies outside the feet (editor only). `src/rig/balance.ts`, `src/scene/BalanceMark.tsx`

### Combinations
- **Steps** with label, notes, targets, timing and "motion only"; new steps copy the current one; the step bar with Play and a ⋯ menu per step. `src/editor/StepBar.tsx`, `src/model/combination.ts`
- **Undo/redo** for every change; a drag or a held key undoes as one step. `src/editor/store.ts`
- **Camera**: Side, Overhead, Behind A/B, Zoom to both / to one fencer, Lock, One view for all steps; each step keeps its view. `src/scene/CameraRig.tsx`, `FitRig.tsx`
- **Show**: distances (feet, point to opponent, "Touch"), ghost of the previous step, labels. `src/scene/measure.ts`
- **Play** in the editor (Space). `src/scene/playback.tsx`, `src/viewer/player.ts`

### Library and sharing
- **Library**: autosave in the browser, collections, search, sort, export selected, import with newest-wins merge, folder sync with 14 daily snapshots, persistent storage. `src/library/`, `src/editor/LibraryDialog.tsx`
- **Share**: a link that carries the combination, with a QR code; the read-only student viewer (Steps / Smooth, phone-friendly). `src/share/link.ts`, `src/viewer/`
- **Export**: captioned picture, PDF handout (two steps per page), video of smooth playback, combination file. `src/export/`

### Quality
- 93 unit tests (including 1,000 random poses that must stay above the floor) (anatomy directions, IK, blades, playback, links, merging, store); run `npm test`.
- Visual checks are done in a headless browser through a dev-only `window.__editor` hook.

## Next (agreed with the coach)

1. Timeline scrubbing in the step bar, and a loop for practising a phrase.
2. Move several joints as one (a whole arm, the whole spine) with the same keys.
3. Point trail and simple arrows to show the path of the point between steps.
4. A short first-run tour, and a test guide with a feedback form for the coach's testers.

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

## Known rough edges

- The flèche, prime, stomach-tuck and lean-back presets are drafts; the coach may want to replace them.
- Video length can drift on a machine that renders very slowly (it follows real time).
- Libraries do not move between sites: the copy on `localhost` and the one on GitHub Pages are separate browsers' storage as far as the browser is concerned. Move work with Library → Back up everything → Import, or point both at the same sync folder.
