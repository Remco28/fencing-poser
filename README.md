# Fencing Poser

A digital wooden mannequin for fencing coaches.

Pose two 3D fencers on a to-scale piste, save each moment of an action as a labelled step, and step through (or play) the whole combination from any camera angle. Students get a read-only link they can open on a phone.

Built for épée first.

**Live:** https://remco28.github.io/fencing-poser/

- [Status](docs/STATUS.md): what is built, where it lives, what is next.
- [Decisions](docs/DECISIONS.md): what was decided and why.

- [Design spec](docs/DESIGN.md): the original plan and milestones.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # anatomy, mirroring and preset checks
npm run build      # typecheck + production build into dist/
```

`?view=top|front|back|side` in the URL picks the starting camera (a stand-in until camera presets land).

Presets are authored from targets rather than guessed angles: `node tools/fit-pose.ts en-garde` prints the solved pose.

## Hosting

Published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`, after the tests pass. The app is static files (`npm run build` → `dist/`), so any web server can host it too. Share links carry the combination after the `#`, so no server ever sees or stores one.
