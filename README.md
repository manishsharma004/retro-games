# Retro Games

Play **NES** and **SNES** ROMs entirely in your browser with [Nostalgist](https://github.com/arianrhodsandlot/nostalgist).

## Features

- Load local `.nes`, `.sfc`, `.smc` (and related) ROM files — nothing is uploaded
- Desktop keyboard + physical gamepad support
- Mobile physical controllers and an on-screen virtual pad
- Fullscreen playback with a fixed **4:3** aspect ratio
- Advanced RetroArch / core settings (shaders, rewind, region, turbo, and more)
- Optional homebrew demo (`flappybird.nes` via Nostalgist’s public resolver)

## Live site

https://manishsharma004.github.io/retro-games/

Deploys automatically to GitHub Pages on every push to `main` (see `.github/workflows/deploy-pages.yml`).

## Quick start

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

> Production builds use `base: '/retro-games/'` so assets resolve correctly on GitHub Pages.

## Bundled ROMs

Commit ROM files to [`public/roms/`](public/roms/) and list them in
`public/roms/manifest.json` to make them appear as **Built-in games** on the
landing page. Mark one entry with `"default": true` to auto-load it on first
visit. Bundled ROMs are deployed to GitHub Pages automatically. See
[`public/roms/README.md`](public/roms/README.md) for details.

> Only commit games you have the legal right to use. This project does not
> distribute copyrighted ROMs; the included `flappybird.nes` is freely
> distributable homebrew.

## Controls

| Action | Keyboard | Virtual pad |
|--------|----------|-------------|
| D-Pad | Arrow keys | D-pad |
| B / A | Z / X | B / A |
| Y / X (SNES) | A / S | Y / X |
| Start / Select | Enter / Shift | Start / Select |

USB or Bluetooth controllers are detected through the browser Gamepad API and handled by RetroArch inside Nostalgist.

## Legal

This project does **not** distribute copyrighted ROMs or BIOS files. Only load games you have the right to use. The “Try demo” button loads a public homebrew title through Nostalgist’s default ROM resolver.

## Stack

- Vite + React + TypeScript
- [nostalgist](https://www.npmjs.com/package/nostalgist) (`fceumm` for NES, `snes9x` for SNES)
