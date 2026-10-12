# Fencing Poser

A digital wooden mannequin for fencing coaches.

Pose two 3D fencers on a to-scale piste, save each moment of an action as a labelled step, and step through (or play) the whole combination from any camera angle. Students get a read-only link they can open on a phone.

Built for épée first.

**Status:** milestones 1–4 done: the editor (posing, presets, steps, library, drag-to-pose, views, readouts) and the student viewer with share links. Next: export (PNG, PDF handout, video). See the [milestones](docs/DESIGN.md#14-milestones).

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

## Hosting

The app is static files: `npm run build` puts them in `dist/`, and any web server can serve that folder (it works from any path). Share links carry the combination after the `#`, so the server never sees or stores a combination.

- **GitHub Pages:** make the repository public (or use a paid plan), set Settings → Pages → Source to "GitHub Actions", then run **Publish to GitHub Pages** from the Actions tab.
- **Self-hosting:** copy `dist/` to any static host or web server.

Share links only work for students once the app is hosted somewhere they can reach.
