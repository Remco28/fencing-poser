# Bugs found and not yet fixed

Old bugs that a review turned up but that were already there before the change under review. One line of what, how to see it, and where it was found.

- **Clicking a pose the fencer already holds adds a history entry that changes nothing.** New combination, fencer A en garde, click "En garde": History gains "Step 1 · A: En garde", and Undo then appears to do nothing. `applyPreset` in `src/editor/store.ts` passes its own label to `edit()`, which skips the "nothing changed" check; already so at 15187b0. Low. Found in the review of the faster-posing change, round 1 (2026-11-16).

- **A hit with the arm that has to lean in moves both feet.** Fencers at short distance, hit the mask or the front leg with the arm: both feet move about 8 cm, half of it across the piste (12.6 cm when the hit also falls short). `touch()` in `src/ik/blades.ts` leans the pelvis, which swings the legs; already so at 15187b0 (the old "touches" buttons). Serious. Found in the review of the faster-posing change, round 2 (2026-11-16). **Fixed** in the round 2 fixes of that review, at the coach's request (a hit now puts both feet back and re-aims).
