# Decisions

Every decision that shapes the app, newest first within each group, with the reason. When a decision changes, edit its row and say so; do not leave a stale one.

## Guiding principle

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | **Keep the app lean.** After each round, ask what can be deleted, merged or made better before adding more. Every option must earn its place. | The coach does not want the app bloated with options and features; what makes or breaks it is how easy it is to use. |
| 2026-10-12 | **UI is the priority.** Ease of posing and clarity of controls come before new features. | Coach: "Let's keep pushing UI because that is what will make or break this project." |

## Product

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | Épée only; foil and sabre may come later. | The coach's weapon. The model leaves room for others. |
| 2026-10-12 | Web app: edit on a desktop browser, view on any device. | Students are on phones; nothing to install. |
| 2026-10-12 | Private library: no sharing between coaches. | Competitive advantage. |
| 2026-10-12 | Wooden-mannequin look. | Clean, neutral, joints visible for posing. |
| 2026-10-12 | Pistol grip by default, French selectable per fencer. | The most common grip in modern épée. |
| 2026-10-12 | Units selectable (metric / imperial). | The piste is metric; heights are often thought of in feet and inches. |
| 2026-10-12 | Two spine joints (stomach and chest). | Stomach tucks and lean-backs are real épée actions. |
| 2026-10-12 | Both discrete stepping and smooth playback, switchable any time. | The coach wants both. Smooth playback needs "motion only" via steps where the path matters (a disengage goes under the blade). |
| 2026-10-12 | The en garde preset was approved as built; its angles are kept literally in `tools/fit-pose.ts`. | The coach: "your en garde pose is good the way it is." |
| 2026-10-12 | Presets are editable: built-ins can be replaced and restored; the coach's own can be saved, renamed, deleted, replaced, and applied to either fencer. | The coach needs to change and keep their own poses. |
| 2026-10-12 | Quinte is not built in. | The coach was not sure of the definition to use; it can be saved as a custom pose. |
| 2026-10-12 | No sound or timing marks for now. | The coach: not needed yet. |
| 2026-10-12 | Blades push each other; arms and bodies do not. | Blade-on-blade contact is well defined; arms bend too many ways to guess. |
| 2026-10-13 | Balance is a **warning, never a correction**: a red "off balance" mark appears under a fencer whose centre of mass lies outside their feet. A foot about to land (within 20 cm of the floor) counts as support. No setting. | Auto-correcting would fight the coach's posing, and some actions (a flèche) are off balance on purpose. Warning on every mid-step would be noise. |
| 2026-10-13 | **Touch leans the body in** (hips and spine) when the arm alone falls short, in small steps, never past balanced. No new control. | A committed-looking touch without another option; balance caps the lean, so the two never fight. |
| 2026-10-13 | **Not built:** soft "spring" joint limits and a flexibility setting. If a real fencing position is blocked, widen that joint's limit instead. | Limits already exist on every joint (shoulders, hips, spine included); a global looseness option would not earn its place. |
| 2026-10-13 | **Ground snapping needs nothing new:** fencers are always set down on the floor, dragged feet cannot go below it, and one foot can still be lifted. | Already the behaviour; a switch would add nothing. |

## Sharing, storage and hosting

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | Hosted on GitHub Pages from a public repo; republished on every push to `main` after tests pass. Live at https://remco28.github.io/fencing-poser/ | Free, no server. Only the app code is public. |
| 2026-10-12 | Share links carry the combination after the `#` (compressed); nothing is stored online. | No server, no accounts; links are snapshots that cannot be revoked, which is acceptable. |
| 2026-10-12 | The library lives in the browser (IndexedDB), with backups by export and, in Chromium browsers, a mirror to a chosen folder plus 14 days of daily snapshots. The app asks the browser to keep its storage. | No server. The coach uses Brave (folder sync needs `brave://flags/#file-system-access-api`); most students use Chrome. |
| 2026-10-12 | Merging a backup or folder copy never replaces newer work (newest `updatedAt` wins, for combinations and presets). | A restore must never silently lose work. |
| 2026-10-12 | Combinations can be filed in collections; the library searches titles, step labels and notes. | The coach expects a large library of poses and combinations. |

## Editing and controls

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | Keyboard posing: Tab picks a joint, A/D, S/W, Q/E move its three movements (Shift ×5, Alt fine), X jumps to the other side. | Approved by the coach; one hand on the keys, one on the mouse. |
| 2026-10-12 | The selected joint's controls appear beside the fencer in the 3D view with their keys; each movement draws a faint coloured path with its keys at the ends. | The coach found it trial and error to learn what each key did. |
| 2026-10-12 | Pronation is shown as a thumb clock ("thumb at 1 o'clock") around the wrist. | Hard to see on the model, especially behind the guard; coaches already describe it this way. |
| 2026-10-12 | Drag-to-pose (IK) on hands, point, feet and hips; handles hide while a joint is selected. | Fast posing is a must; handles cluttered the wrist when fine-tuning. |
| 2026-10-12 | The panel is tabs (Pose, Step, Fencers, Help) under an always-visible "Posing fencer" switch. | One long scrolling panel was hard to find things in. |
| 2026-10-12 | On/off controls are switches with a visible state; actions are plain buttons. | The coach could not tell whether a button was on. |
| 2026-10-12 | Step actions (move, delete, motion only) live in a ⋯ menu on the current step. | Bare ← → buttons in the step bar were confusing and easy to hit by accident. |
| 2026-10-12 | "One view for all steps" is a setting, and the view can be locked. | Keeping the camera consistent between steps was hard. |
| 2026-10-12 | Play previews smoothly inside the editor (Space). | The coach could only watch motion by sharing or exporting. |
| 2026-10-12 | Fencer labels are small, drawn above the head on screen, and can be turned off. | They covered the heads in overhead views. |

## Technical

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | TypeScript, Vite, React, Three.js via React Three Fiber and drei, Zustand. | Standard, fast web 3D stack. |
| 2026-10-12 | Poses are stored as anatomical angles in degrees per joint, not quaternions. | Readable presets, mirroring is a swap, joint limits always hold, interpolation stays inside limits. |
| 2026-10-12 | The fencer is always set down on the floor; height is never stored. | Presets work at any height; no floating fencers. |
| 2026-10-12 | Built-in presets are solved from targets by `tools/fit-pose.ts` and written to `src/presets/fitted.ts`; never hand-tuned angles. | Presets come from fencing intent; the fitter needs "upright torso" terms or it leans the body to cheat. |
| 2026-10-12 | Exports render in their own hidden canvas. | Pictures and videos never show editor handles or controls, and the coach's view is untouched. |
| 2026-10-12 | The student viewer loads without the editor's code. | Phones download less. |
