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
| 2026-10-12 | Both discrete stepping and smooth playback, switchable any time. | The coach wants both. |
| 2026-10-13 | **Paths are shaped by dragging, not with "motion only" steps.** Click the arrow between two steps, drag the ring in the middle of a point's path; both steps stay as they are. Undoable; Straighten resets. "Motion only" left the interface; old combinations that used it still play. | The coach: "with 'motion only', I straight up have no idea what that toggle does", and proposed shaping the trail directly. |
| 2026-10-13 | **A bend is a change to the arm's joints, solved once at the middle and faded in and out across the movement** (`Step.bend`). Not a whole halfway pose blended through, and not the arm re-solved every frame. A test sweeps drags in every direction and fails on any frame that leaps. | The coach saw a "crazy Z shape" path. Blending through a halfway pose made the point double back (turns up to 180°); re-solving each frame made it leap (17–56 cm in one frame). Fading one arm change in and out keeps every frame smooth and still passes exactly through the ring. |
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
| 2026-11-15 | **Stick figures are a strip under the 3D view, not a mode and not flat camera views.** Both are always in sight; the sketch is drawn from the same pose, so nothing is converted. Views: Side, Above, Behind. | The coach: getting the body roughly right "takes an eternity", and suggested stick figures. In a flat view depth cannot be got wrong and the camera never has to turn. A strip beside the 3D view leaves the Side / Behind / Overhead buttons, which also set what students see, alone. |
| 2026-11-15 | **A dot is a place: it goes where it is dragged.** Hips, chest, head, hands, elbows, feet, knees, point, on the sketch and (six of them) on the 3D figure. The pose is always worked out from the pose the drag began with, so where the pointer is decides the pose, not the route it took. | One rule for every dot. Working from the previous frame let small slips add up. |
| 2026-11-15 | **Keep in place**: Feet (on by default), Hand, Point. Kept things stay put while anything else moves, by drag or key; a limb being edited directly is left alone. | Fixing one thing used to break another: moving the hips took the point off its target, turning the pelvis swung the feet. |
| 2026-11-15 | **A hand or foot pulled past its reach brings the body**: the hips slide toward it and sink as the legs need, feet planted. No automatic spine lean. | A lunge is made by pulling the front foot or the hand forward; before, the limb just stopped. |
| 2026-11-15 | **The point turns the wrist first, then moves the hand by what is missing**; the elbow bends whichever way lets the wrist keep the blade on line. With Hand kept, only the wrist turns. | The point handle used to turn the wrist only, so placing a point meant alternating two handles. |
| 2026-11-15 | **Actions: one click per named action**, for the posing fencer, in the current step, or as a new step that the action names ("A: Beat 6"; two fencers in one step read "A: Recover · B: Hits the body with a lunge"). A label the coach typed is never changed. A hit that lands highlights its target. | Most steps of a phrase are one named action; posing each by hand was the slow part. Built from the coach's own phrases (beat 6, disengage attack under the hand, parry 6 riposte, fake advance lunge, grab and attack, overcut to the arm). |
| 2026-11-15 | **A line is named for where the opponent's blade ends up**: parry, engage or beat 6 (and 3, 8, 2) carries it to the fencer's outside, 4 (and 7, 1) to the inside. The old "engage in sixte / quarte" buttons had the two the wrong way round. **To confirm with the coach.** | In sixte the hand is outside and the opponent's blade is held outside it. |
| 2026-11-15 | **A parry or engagement moves the opponent's blade, not the other way round**: the hand goes to the line's position and the opponent's blade is laid against the strong part of the blade (their wrist turns; their hand may move 8 cm at most). A parry only takes a blade that reaches the strong half of the parrying blade; otherwise it is a parry in the air. A beat or engagement with the blades out of reach does nothing and says so. | A parry that left the attacker's point on the chest read as a miss. Wrenching the attacker's arm about to make a mismatched parry work read worse. |
| 2026-11-15 | **A hit with a lunge lunges only as deep as it needs** (a quarter, half, three quarters, full). **Recover** returns the whole fencer to en garde over the back foot. Footwork keeps the back foot where it is. | A full lunge at a near target (the hand) folded the arm up and missed. |
| 2026-11-15 | **Distance by name is worked out, not fixed**: short = the extended arm reaches the body standing upright, medium = a lunge reaches, long = an advance and a lunge. | It follows the fencers' sizes and the coach's own Lunge pose. |
| 2026-11-15 | **"Path in: under / over the blade" makes one pin automatically** (12 cm under the opponent's blade; 15 cm over their point). Direct clears it. | The design's "later idea"; a disengage or cut-over should not need the path shaped by hand. |
| 2026-10-13 | A pin's arm is found by nudging the current arm toward the ring in small steps, each the smallest turn of the joints (damped least squares), falling back to the one-shot solver; of the answers that arrive, the smallest change wins. | An arm reaches most places several ways; neighbouring rings that picked different ways (shoulder twist +36° at one, −91° at the next) swung the point up to 56 cm off the route between them. Now about 1–4 cm. |
| 2026-10-13 | The student viewer has a view menu (Coach's view, Side, Overhead, Behind A/B) and Lock view. Any view but the coach's, including one turned to by hand, stays put while playing and stepping. Reset view is gone (Coach's view does it). | Play always returned to the coach's (or side) view, which hid the hands. |
| 2026-10-13 | Every control in the step bar is 34 px tall, and the steps scroll without a scrollbar. | Buttons sat at different heights, and a scrollbar showed under the steps. |
| 2026-10-13 | A History list (button beside Undo/Redo, hidden by default), as in photo editors: every edit by name, oldest first; click one to go back to just after it, later edits stay greyed until a new edit drops them. Names are read from what changed (`src/editor/history.ts`), not written by each action; edits that change nothing are not recorded. It lasts for the session, like undo. | Asked for by the coach; naming by diff keeps every action covered without 25 hand-written labels. |
| 2026-10-13 | Pins move only up/down and across the piste, never along it (how far along comes from the movement). The spline's slopes are limited so a joint never swings past a pin (no hooks past a ring), and the trail is drawn with 48 samples a step. A press within 18 px of a ring takes the ring. | The coach found the path hard to control: a drag in a 3D view also moved the point toward or away from the camera, the trail showed corners and hooks the video did not. |
| 2026-10-13 | A large Stop button floats over the stage while playing; Play/Stop stays in view however many steps there are (only the steps scroll). | With many steps the step bar scrolled Play out of sight, leaving only "click a step" to stop. |
| 2026-10-13 | Camera: drag turns, right-drag pans, scroll zooms toward the pointer; a one-line hint says so at the stage's bottom right. Space+drag was tried and removed. | The coach had not found right-drag. Space+drag competed with Space for Play. |
| 2026-10-13 | The camera toolbar is grouped by fencer: Side, Overhead, Fit both, then an A group and a B group (Behind, Zoom), each with the fencer's badge. | "Behind A" and "Zoom to A" sat apart, and Zoom followed whoever was being posed. |
| 2026-10-13 | Motion guides show their key letters only for the movement in use (just nudged, or its row pointed at in the joint controls). | All six letters on a small joint (the spine) were cluttered; the joint controls already show the keys. |
| 2026-10-13 | Paths are shaped with up to three pins per point: grab the red path anywhere and pull; near a ring moves it; double-click a ring removes it. Each pin is solved once; a smooth spline (one pin = the old halfway bend exactly) carries the arm through them. Older single bends read as a pin halfway. | Not everything moves in one arc (a late drop, an S round two blades). Free-form path drawing was judged too complicated; three pins is the compromise. |
| 2026-10-13 | The path-shaping banner is one line docked above the step bar ("Path 2 → 3 · Straighten · Done"), not a paragraph over the fencers. | It covered the action it was explaining. |
| 2026-10-13 | Removed the Joint dropdown, its sliders and the piste-position slider; the controls beside the joint took over typed angles, hips position and Straighten. | They duplicated the controls beside the joint (lean principle; coach agreed). |
| 2026-10-13 | Stomach and chest bend as one spine by default, with a switch in the joint controls. | Bending the back is one movement to a coach; two joints made it twice the work. |
| 2026-10-13 | The point trail comes with Ghost (no new switch) and always shows while shaping a path. No arrows. | Shows a disengage's path; one less option. |
| 2026-10-13 | A timeline in the step bar scrubs the movement; Loop repeats playback. | Agreed next step; practising a phrase. |
| 2026-10-13 | A four-card first-run tour, reopenable from Help. | New users need the handles, the joint controls, Play and Share explained once. |
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
| 2026-10-13 | The fencer rests on the lowest part of the body, not only the soles: in a very deep bend the knee touches down (a kneel) instead of sinking through the floor. Tested on 1,000 random poses. | The coach saw legs disappearing below the piste in deep flexes. |
| 2026-10-12 | Built-in presets are solved from targets by `tools/fit-pose.ts` and written to `src/presets/fitted.ts`; never hand-tuned angles. | Presets come from fencing intent; the fitter needs "upright torso" terms or it leans the body to cheat. |
| 2026-10-12 | Exports render in their own hidden canvas. | Pictures and videos never show editor handles or controls, and the coach's view is untouched. |
| 2026-10-12 | The student viewer loads without the editor's code. | Phones download less. |
