# Bugs found and not yet fixed

Old bugs that a review turned up but that were already there before the change under review. One line of what, how to see it, and where it was found.

- **Clicking a pose the fencer already holds adds a history entry that changes nothing.** New combination, fencer A en garde, click "En garde": History gains "Step 1 · A: En garde", and Undo then appears to do nothing. `applyPreset` in `src/editor/store.ts` passes its own label to `edit()`, which skips the "nothing changed" check; already so at 15187b0. Low. Found in the review of the faster-posing change, round 1 (2026-11-16). **Fixed** 2026-11-16 in the simplify pass (`applyPreset` returns early when nothing would change).

- **A hit with the arm that has to lean in moves both feet.** Fencers at short distance, hit the mask or the front leg with the arm: both feet move about 8 cm, half of it across the piste (12.6 cm when the hit also falls short). `touch()` in `src/ik/blades.ts` leans the pelvis, which swings the legs; already so at 15187b0 (the old "touches" buttons). Serious. Found in the review of the faster-posing change, round 2 (2026-11-16). **Fixed** in the round 2 fixes of that review, at the coach's request (a hit now puts both feet back and re-aims).

## Found in review round 3 (2026-11-16) and left, at the coach's decision to stop the review there

Each is small and was reproduced or read; none touches saved work.

- **Two saves of the students' view within one second undo as one step.** Use this view for students, turn the camera, save again inside a second: Undo goes back past the first save. `setShot` in `src/editor/store.ts` passes the key `'shot'` to `edit()`, which joins edits with the same key made within a second. Medium (rare timing). **Fixed** 2026-11-16 in the simplify pass (`setShot` has no key; it now sets one view for every step).
- **Pressing Space (Play) in the middle of a sketch drag keeps editing the step under playback.** The change shows only when playback stops; one Undo removes it. `dragPose` in `src/editor/store.ts` does not check `preview` (the 3D handles are unmounted while playing; the sketch is not). Medium (rare timing). **Fixed** 2026-11-16 in the simplify pass (`dragPose` returns early while `s.preview` is set).
- **The "held back" line stays up after a pose click, an action, the dial, a pose from another step, or a pose applied to the other fencer.** It is cleared when the fencer or the step changes and by the next key edit that is not held back, but not by those. Display only. Low. **Fixed** 2026-11-16 in the simplify pass (`edit()` returns `heldBack: null`; the dial and pose from another step are gone).
