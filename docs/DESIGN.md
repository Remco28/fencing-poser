# Fencing Poser: Design Spec

Status: **final for v1; build in progress** (see [Open decisions](#13-open-decisions)).
Last updated: 2026-10-12

---

## 1. The idea

Artists keep a wooden mannequin on the desk so they can bend it into any pose and draw from it. Fencing Poser is that mannequin, built for a fencing coach:

- **Two fencers on a piste.** Each is a simple wooden-style figure holding an épée. It has the joints that matter for fencing and none of the ones that don't (fingers, toes).
- **Pose them quickly.** Start from a preset ("en garde", "lunge", "parry 4"), then drag the hand, foot or hips into place.
- **Each pose is a step.** A step has a label and an optional coaching note, e.g. "Step 2: feint disengage, watch the point, not the hand."
- **Steps make a combination.** A four-action attack is four (or more) steps in order.
- **Show it from any angle.** Each step remembers its own camera: overhead for distance, behind the shoulder for a parry, the referee's side view for timing.
- **Play it back.** Use Prev/Next for discussion, or smooth playback to see the whole action move.
- **Share it read-only.** Students open a link on their phone. The link shows the combination and nothing else.

The goal is not realistic human animation. It is a clear, flexible teaching diagram that the coach never has to draw.

### Who uses it

| Person | Device | Can do |
|---|---|---|
| The coach (author) | Desktop/laptop browser | Everything: pose, build, label, export, share |
| Students | Phone or any browser | View a shared combination: step, play, rotate the camera |

Combinations are **not** shared with other coaches. The library is private by design.

### Non-goals

- Realistic anatomy, muscles, faces, fingers, toes
- Physics, collision detection, automatic hit detection or scoring
- Editing on phones
- Multi-user editing, accounts, or a public library
- Replacing Blender or Mixamo. If a feature needs a 3D-artist workflow, it is out of scope.

---

## 2. Glossary

| Term | Meaning in this app |
|---|---|
| **Fencer** | One mannequin plus its épée. Each scene has two: **A** and **B**. |
| **Pose** | The full body position of one fencer: joint angles plus where the body stands on the piste. |
| **Preset** | A named, reusable pose. Built-in ones ship with the app; the coach can save their own. |
| **Step** | One moment in a combination: both fencers' poses, a camera, a label, notes and display options. |
| **Combination** | An ordered list of steps with a title and tags. This is what gets shown to students. |
| **Library** | All of the coach's combinations and custom presets. |
| **Viewer** | The read-only player that students see. |

---

## 3. The mannequin

### 3.1 Joints

A simplified skeleton of **17 joints**. Each joint rotates only in the directions a human can, within human limits. The limits are what keeps the IK (drag-to-pose) solutions natural.

| # | Joint | Movement | Why it matters in fencing |
|---|---|---|---|
| 1 | **Pelvis (root)** | Moves anywhere on the piste; rotates in all directions | Footwork, lunge depth, body angle to the opponent |
| 2 | **Lower spine (abdomen)** | Bend forward/back, side bend, twist | Tucking the stomach to avoid a hit, leaning |
| 3 | **Upper spine (chest)** | Bend forward/back, side bend, twist | Shoulder line, effacement (turning the chest away) |
| 4 | **Neck/head** | Nod, tilt, turn | Head and mask position, ducking |
| 5–6 | **Shoulders** | Raise/lower, forward/back, twist | Arm extension and lines |
| 7–8 | **Elbows** | Bend | Extension and retraction |
| 9–10 | **Wrists** | Bend up/down, side to side, **rotate (pronation/supination)** | Parries, angulation, point control: critical for épée |
| 11–12 | **Hips** | Forward/back, out/in, turn the leg in/out | Lunge, en garde stance, foot direction |
| 13–14 | **Knees** | Bend | Stance depth, lunge |
| 15–16 | **Ankles** | Flex/point, small roll | Heel strike in a lunge, back foot flat |
| 17 | **Weapon grip** | Small adjustment of the blade angle in the hand | Grip style (French/pistol), angulated hits |

Hands and feet are single rigid pieces. The non-weapon arm uses the same joints as the weapon arm.

### 3.2 Body size

- **Height** adjustment (must). The whole body scales together.
- **Build** (shoulder width, girth) adjustment (should). This helps tell fencers apart and model a bigger opponent.
- **Arm length** adjustment (later). Useful for reach discussions, but rarely needed.

Poses are stored as joint angles, not positions, so a preset works on a fencer of any size.

### 3.3 The épée

- Standard proportions: 90 cm blade, 13.5 cm bell guard, 110 cm maximum overall.
- Fixed to the weapon hand, with grip adjustment (joint 17).
- Left- or right-handed per fencer.
- The point is a named spot that the IK, the distance readout and the point trail all use.
- Foil and sabre may come later (different blades and guards). They are not in v1.

### 3.4 Look

Wooden-mannequin style built from simple rounded shapes, with visible joint spheres. The figures are built in code, so no 3D modelling tools are needed and every joint is explicit. Fencer identification uses an optional red/green accent (like the scoring lights), off by default. See [Open decisions](#13-open-decisions).

---

## 4. Posing

Repositioning 17 joints for every step would be daunting. The design gives three faster ways in, with joint-by-joint control as the fallback.

### 4.1 Presets (must)

Built-in presets, applied to either fencer with one click:

- **Stances and footwork:** en garde, advance (mid-step), retreat (mid-step), lunge, recovery, flèche (take-off and mid-flight), balestra, standing at attention / salute
- **Arm positions:** extension (straight arm), each parry position **prime through octave**, plus the matching invitation (open-line) positions
- **Defensive body moves:** stomach tuck, duck, lean back, step-back with the arm in

The coach can **save any pose as a custom preset**, rename it, and delete it. Custom presets live in the library.

**Partial presets (should):** apply only the **upper body** or only the **legs** of a preset. Example: "parry 6" arms on top of "mid-retreat" legs. This makes a small set of presets combine into many poses.

**Mirroring:** applying a preset to fencer B automatically faces it the other way. Swapping handedness mirrors the pose.

### 4.2 Drag-to-pose / inverse kinematics (must)

Grab a handle and the rest of the limb follows:

| Handle | Moves | Joints that follow |
|---|---|---|
| Weapon hand | Hand position | Shoulder and elbow |
| Épée point | Where the point aims | Wrist first, then elbow and shoulder |
| Each foot | Foot position | Hip and knee |
| Pelvis | Body position and height | Legs bend to keep the feet planted |
| Chest | Lean and tuck | Spine joints |

- **Feet stay planted** when the pelvis moves, so dropping the hips gives a deeper lunge instead of a floating fencer.
- Elbow and knee direction can be steered (an elbow-direction handle) when the default bend points the wrong way.
- Joint limits keep results human.

### 4.3 Joint-by-joint (fallback)

Click any joint to get a rotation handle for precise adjustment. A side panel shows that joint's angles as sliders for exact values.

### 4.4 Editing helpers

- **New step copies the previous step** (must). Every step starts where the last one ended.
- **Undo/redo** for every change.
- **Copy one fencer's pose onto the other** (mirrored).
- **Reset joint / reset limb** back to the preset it came from.
- Keyboard shortcuts for the common actions (next/prev step, new step, undo, camera views).

---

## 5. The piste

- **To scale** (must): 14 m long × 1.5–2 m wide, with centre line, en garde lines (2 m from the centre), warning zones and rear-limit lines, plus run-off at each end.
- Fencers stand on the piste at true scale, so distance on screen is real distance.
- Neutral floor and background so the figures stand out. A plain-floor option hides the markings.

### 5.1 Distance readout (must)

Toggleable on-screen measurements:

- **Front foot to front foot** (fencing distance)
- **Épée point to the nearest point on the opponent's body** (is it in range?)
- Optional: distance from each fencer to their rear-limit line

Units follow the coach's setting (metric or imperial).

---

## 6. Target areas and annotations

- **Target highlight** (must): in épée the whole body is target, so this means highlighting specific areas being discussed, such as the wrist/forearm, the front foot, the mask, the shoulder or the torso. Choose them per step.
- **Point trail** (should): a line showing the path of the épée point from the previous step to this one. Great for disengages, circular parries and coupés.
- **Ghosting** (should, toggleable): a faint copy of the previous step's pose, so students see what moved.
- **Arrows** (later): simple 3D arrows for "move here" / "blade goes this way".

---

## 7. Camera

- **Free orbit**, zoom and pan (mouse on desktop, touch on phone).
- **Preset views**, one click each:
  - **Side** (the referee's view: distance and timing)
  - **Overhead** (distance and angles)
  - **Behind A** / **Behind B** (over the shoulder: parries and lines)
  - **Front A** / **Front B**
- **Saved camera per step** (must). Each step remembers the camera it was authored with. In the viewer, moving between steps also moves the camera smoothly, so the combination tells its own story ("step 3 switches to behind B to show the parry").
- In the viewer, students can orbit freely. A "reset view" button returns to the step's saved camera.

---

## 8. Combinations and the library

### 8.1 Combination

- Title, description, tags (e.g. *attack*, *counter-attack*, *second intention*, *beginner*, *distance*)
- Ordered steps. Steps can be added, duplicated, deleted and reordered by dragging.
- Each step has:
  - **Label** (must, short): "Feint disengage"
  - **Notes** (optional, longer): what to watch for
  - Both fencers' poses
  - Saved camera
  - Display options: ghosting on/off, highlighted targets, which readouts show
  - Duration (smooth playback only): how long the move *into* this step takes

### 8.2 Library

- List of combinations with search and tag filter
- Custom presets
- Everything lives in the coach's browser. **Export/import of the whole library as one file** is the backup (see [Storage](#11-storage)).

---

## 9. Playback

### 9.1 Discrete stepping (must)

Prev/Next buttons, a step list, and keyboard/swipe navigation. Each step is shown exactly as authored.

### 9.2 Smooth animation (should): it is feasible

Each step already stores every joint angle, so the app can calculate all the in-between frames automatically. Each joint glides from its angle in one step to its angle in the next, and the body and camera glide along too. No extra authoring is needed: a combination made for stepping can also be played.

- Play/pause, a speed control (0.25× to 1×), and loop
- Per-step duration, so a quick disengage and a slow preparation can have different timing
- Easing, so motion starts and stops naturally instead of robotically

**How the motion is calculated, and where it goes wrong.** The in-betweens interpolate **joint angles**, not the épée point's position. Turning the wrist or shoulder therefore moves the point along a curve on its own; it never travels in a straight line through space. But the app only knows the start and end poses, so it takes the most direct rotation between them. It does not know that a disengage has to go **under** the opponent's blade. With only two steps ("blade on the 4 side" → "blade on the 6 side"), the point would sweep straight across and pass through the opponent's blade.

**The fix: via steps.** The coach adds **one** extra pose in the middle of the move ("point under the blade"), not 30 frames. Motion then goes start → via → end and follows the real path. A via step:

- is made the same way as any step (copy the previous one, drag the point down)
- is marked **"motion only"**, so it is skipped in Prev/Next stepping and in the PDF handout. Students stepping through still see the clean three-step story.
- costs about 15 seconds to author

Most actions need no via step: an extension, lunge, retreat or simple parry already moves along the right path. Via steps are only needed where the path matters: disengages, circular parries, coupés, and the hand-before-foot timing of a lunge.

**Known limits, accepted:**

- In-betweens are mathematically smooth, not biomechanically correct. A real lunge has the hand leading the foot; plain interpolation moves everything at once. The fix is a via step ("arm extended, feet still"). A per-limb timing offset can come later if it is needed.
- There is no collision. Blades and bodies can pass through each other where the coach has not added a via step.
- Feet may glide during an advance instead of lifting. A via step or a mid-step preset avoids this.
- Smooth playback is an optional extra. Discrete stepping never depends on it, and a combination with no via steps still steps perfectly.

**Later idea (not planned):** an automatic "go under / go over the blade" choice per step that generates the via pose. Only worth building if via steps prove tedious in practice.

**Effort:** discrete stepping is the foundation. Smooth playback reuses the same data and adds roughly a few days of work on top, so it is cheap. It is scheduled right after discrete stepping works.

---

## 10. Sharing and export

### 10.1 Read-only viewer links (must)

The coach clicks **Share** and gets a link (and a QR code for showing at practice). Students open it on any phone and get the viewer: step through, play, rotate. They cannot edit.

**Recommended approach: the link contains the combination.** The combination is compressed into the part of the URL after `#`, which browsers never send to any server. The app itself is static files on free hosting. Consequences:

- No server, database or accounts to run. Nothing private is stored online.
- Only people with the link can see the combination.
- A link is a snapshot. Editing the combination later means sending a new link, and an old link cannot be revoked.
- Links are long (a few KB). They work fine in messages, and the QR code avoids typing.

The alternative, a small hosted backend with short, revocable, updatable links, is possible later if snapshots turn out to be a problem. See [Open decisions](#13-open-decisions).

### 10.2 Export (must)

| Export | Use |
|---|---|
| **PNG** of the current step | Drop into a message or slide |
| **PDF handout** | All steps on one or two pages, each with its image, label and notes |
| **Video** (WebM; MP4 where the browser supports it) | Smooth playback recorded to a file |
| **GIF** (should) | Short loop for messaging |
| **Combination file** (.json) | Backup, or moving a single combination between browsers |

---

## 11. Storage

- The library is stored **in the browser** (IndexedDB) on the coach's computer, and works offline.
- **Risk:** browser data can be cleared by the user, a browser reset or a profile change. Mitigations:
  - One-click **export of the whole library** to a file
  - A gentle reminder when there are unexported changes older than N days
  - Import that merges, so restoring a backup never silently overwrites newer work
- All saved data carries a `schemaVersion`, so old files keep opening as the app evolves.

---

## 12. Technical design

### 12.1 Platform: web app

A web app reaches every student device with no install. 3D in the browser is mature, and the scene is small. It runs fine on the coach's Linux machine. A desktop wrapper (Tauri) is possible later but not planned.

### 12.2 Stack

| Part | Choice | Why |
|---|---|---|
| Language/build | **TypeScript + Vite** | Fast dev loop, typed data model |
| UI | **React** | Library, step list, panels, forms |
| 3D | **Three.js** via **React Three Fiber** + **drei** | Standard WebGL stack. drei provides orbit controls and transform handles. |
| State | **Zustand** with undo/redo history | Simple, and works with React Three Fiber |
| IK | **Custom two-bone analytic solver** for arms and legs, plus a short-chain solver for the spine | Arms and legs are two-segment chains with an exact, stable solution, so no heavy IK library is needed. |
| Rotation math | Anatomical angles per joint, converted to quaternions for rendering | Readable presets, trivial mirroring, joint limits always hold |
| Preset authoring | `tools/fit-pose.ts`: describe targets (feet on the line, point at the opponent), solve for angles | Presets come from fencing intent, not guessed numbers |
| Storage | IndexedDB (via `idb`) | Large, offline, per-browser |
| Share links | Native `CompressionStream` (deflate) → base64url in `#fragment`; `qrcode` package | No server |
| Export | Canvas → PNG; `jsPDF` for handouts; `MediaRecorder` for video | All in the browser |
| Tests | **Vitest** (data model, IK math, link encoding); browser smoke tests | Math and serialization are the parts that break silently |
| Hosting | **GitHub Pages** (public repo), deployed by GitHub Actions | Free; only the app code is hosted, never the combinations |

### 12.3 Data model (sketch)

```ts
type Vec3 = [number, number, number];            // metres

interface Pose {
  // Height is never stored: the fencer is set down so the lowest foot touches
  // the floor, and `lift` raises them (a flèche in the air).
  root: { x: number; z: number; lift: number };
  // Anatomical angles in degrees, e.g. { shoulder_r: { flex: 30, abduct: 10 } }.
  // A joint table maps each name to an axis, sign and limits. Left and right
  // values mean the same thing, so mirroring is a swap, presets read like
  // coaching ("elbow bent 90°"), and interpolation stays inside the limits.
  joints: Record<JointName, Record<string, number>>;   // missing = 0
}

interface FencerSetup {
  height: number;            // metres
  build: number;             // 0.8–1.2 scale
  handedness: 'right' | 'left';
  weapon: 'epee';            // 'foil' | 'sabre' later
  grip: 'french' | 'pistol';
  accent?: 'red' | 'green' | null;
}

interface Step {
  id: string;
  label: string;
  notes?: string;
  poses: { A: Pose; B: Pose };
  camera: { position: Vec3; target: Vec3; fov: number };
  display: { ghost: boolean; targets: TargetArea[]; readouts: Readout[]; trail: boolean };
  durationMs?: number;       // time to move into this step when playing
  motionOnly?: boolean;      // via step: shapes smooth playback, hidden from stepping and handouts
}

interface Combination {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  tags: string[];
  fencers: { A: FencerSetup; B: FencerSetup };
  steps: Step[];
  createdAt: string; updatedAt: string;
}

interface PresetPose {
  id: string; name: string;
  builtIn: boolean;
  pose: Pose;                // authored right-handed, facing +X; mirrored on apply
  parts: 'full' | 'upper' | 'lower';
}
```

A step is roughly 2 × 17 joints × up to 3 angles, so a 10-step combination is a few KB uncompressed. That is small enough for share links.

### 12.4 Structure (planned)

```
src/
  model/       # types, joint table + limits, serialization, migrations
  rig/         # mannequin geometry, skeleton, épée, sizing
  ik/          # two-bone solver, spine solver, constraints
  scene/       # piste, lighting, cameras, readouts, ghost, trails, targets
  editor/      # posing handles, step list, preset panel, inspector
  viewer/      # read-only player
  library/     # IndexedDB store, import/export
  share/       # link encode/decode, QR
  export/      # PNG, PDF, video, GIF
  presets/     # built-in preset data (JSON)
```

The **viewer** is the same app at a different route (`/view#…`). It loads only the viewer code, so it stays light on phones.

---

## 13. Open decisions

To settle before building. Recommendations are marked ★.

| # | Question | Options | Status |
|---|---|---|---|
| D7 | Red/green fencer accents | ★ Optional, off by default | proposed |

### Decided

| Decision | Why |
|---|---|
| Web app, editing on desktop, viewing on any device | Students are on phones; nothing to install |
| Épée only in v1 | The coach's weapon. The model leaves room for foil and sabre. |
| Spine has two joints (abdomen + chest) | Stomach tucks and lean-backs are real épée actions |
| Presets, custom presets, IK, copy-previous-step, undo | Posing from scratch every time would make the tool unusable |
| Saved camera per step | Parries and distance need different viewpoints |
| Private library, no coach-to-coach sharing | Competitive advantage |
| Students get combinations through links that hold the data (D1) | No server, nothing stored online. Snapshot links are acceptable. |
| Wooden-mannequin look (D2) | Clean and neutral, with joints visible for posing |
| Pistol grip by default, French selectable per fencer (D3) | The most common grip in modern épée |
| Smooth playback in M4, with via steps, and the viewer can switch between smooth and discrete at any time (D6) | The coach wants both options |
| Hosting (D5): GitHub Pages or self-hosted, coach to decide | The app is static files either way. A manual Pages workflow is ready. Combinations live in the coach's browser, the library folder and share links, never in the repo. |
| Units selectable, metric or imperial (D4) | The piste is metric; heights are often thought of in feet and inches |

---

## 14. Milestones

Each milestone ends with something the coach can try.

| # | Milestone | Done when |
|---|---|---|
| **M1** ✅ | **One mannequin** | A sized, wooden-style fencer with an épée stands in the scene. Every joint can be rotated within limits. Orbit camera. Height adjustable. |
| **M2** ✅ | **Two fencers, piste, steps** | To-scale piste. Fencers A and B. Built-in presets plus save-as-preset. Steps with labels and notes. New step copies the previous one. Prev/Next. Undo/redo. Library saved in the browser plus file export/import. |
| **M3** ✅ | **Fast posing and teaching views** | IK handles (hand, point, feet, pelvis, chest). Camera presets plus saved camera per step. Distance readouts. Target highlights. Ghosting toggle. Partial presets. |
| **M4** ✅ | **Viewer and sharing** | Smooth playback with per-step duration. Read-only viewer route that works on phones. Share link + QR code. Hosted. |
| **M5** | **Export** | PNG, PDF handout, video, GIF. |
| Later | | Point trail polish, arrows, arm length, foil/sabre, per-limb timing offsets, hosted links (if D1 changes), desktop wrapper |

After M2 and M4, the coach gets a hands-on test round with a feedback form.
