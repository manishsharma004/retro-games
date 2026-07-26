# AGENTS.md

## Cursor Cloud specific instructions

Retro Games is a single client-side Vite + React + TypeScript SPA (a browser
NES/SNES emulator via `nostalgist`). There is no backend, database, or test
suite.

### Running / building
- Standard scripts live in `package.json`: `npm run dev`, `npm run build`, `npm run lint` (oxlint). CI (`.github/workflows/deploy-pages.yml`) uses Node 22 and only runs `npm run build`.
- Dev server URL is `http://localhost:5173/retro-games/` — the trailing `/retro-games/` base path is required (set by `base` in `vite.config.ts`); the root path 404s for assets.
- Emulator cores/shaders (and the built-in demo) are fetched from Nostalgist's CDN on first game launch, so gameplay needs outbound network access. Cores are cached after the first load.

### Bundled ROMs
- ROMs committed under `public/roms/` are served at `/retro-games/roms/*` and deployed to GitHub Pages. `public/roms/manifest.json` lists them; an entry with `"default": true` auto-launches on first visit. See `public/roms/README.md`.
- Do not commit copyrighted ROMs; only freely-distributable homebrew (the included `flappybird.nes`).

### Non-obvious gotchas
- Keyboard input during play is handled by `useKeyboardControls` (capture-phase
  listeners → `pressDown`/`pressUp` with `stopPropagation`). This avoids
  Nostalgist's `respondToGlobalEvents` path, which ignores keys while focus is
  on interactable elements (toolbar / on-screen `<button>`s) and was dropping
  Z+X / Z+arrow combos. RetroArch keeps its default Z/X/arrow binds because
  `pressDown` synthesizes those same key codes — do not remap to `num*`
  (Nostalgist maps `num1`→`Numpad1` while RetroArch treats `num1` as digit 1).
  Synthetic/automated key events (computer-use) may still be flaky against the
  WASM core; prefer on-screen controls for automation, and test real keyboard
  input manually in a browser.
- The on-screen virtual controller shows whenever the browser reports a coarse pointer; the cloud VM's browser reports touch, so the pad appears even on the "desktop" cloud browser (it is hidden on real non-touch desktops).
- Emscripten writes a fixed pixel size onto the `<canvas>` at launch; CSS in `src/styles/app.css` uses `width/height: 100% !important` + `object-fit: contain` so it still scales to fill the stage (important for fullscreen).
- Simultaneous opposing D-pad inputs (Up+Down / Left+Right) require the core options `fceumm_up_down_allowed` / `snes9x_up_down_allowed`; these are enabled by default and toggleable in Advanced settings (require "Apply & relaunch").
- `pressDown`/`pressUp` are ref-counted so keyboard and on-screen controls can hold the same button without one release canceling the other.
