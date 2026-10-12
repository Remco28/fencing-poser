# Fencing Poser

A digital wooden mannequin for fencing coaches.

Pose two 3D fencers on a to-scale piste, save each moment of an action as a labelled step, and step through (or play) the whole combination from any camera angle. Students get a read-only link they can open on a phone.

Built for épée first.

**Status:** milestones 1–3 done (posable fencers, piste, steps, presets, library with folder sync, drag-to-pose, per-step cameras, distance readouts, ghosting, target highlights). Next: the student viewer, smooth playback and share links. See the [milestones](docs/DESIGN.md#14-milestones).

- [Design spec](docs/DESIGN.md): what we are building, why, and in what order.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # anatomy, mirroring and preset checks
npm run build      # typecheck + production build into dist/
```

`?view=top|front|back|side` in the URL picks the starting camera (a stand-in until camera presets land).

Presets are authored from targets rather than guessed angles: `node tools/fit-pose.ts en-garde` prints the solved pose.
