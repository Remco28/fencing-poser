# Bugs found and not yet fixed

Old bugs that a review turned up but that were already there before the change under review. One line of what, how to see it, and where it was found.

- **Clicking a pose the fencer already holds adds a history entry that changes nothing.** New combination, fencer A en garde, click "En garde": History gains "Step 1 · A: En garde", and Undo then appears to do nothing. `applyPreset` in `src/editor/store.ts` passes its own label to `edit()`, which skips the "nothing changed" check; already so at 15187b0. Low. Found in the review of the faster-posing change, round 1 (2026-11-16).
