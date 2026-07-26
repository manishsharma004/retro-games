# Bundled ROMs

Files in this folder are committed to the repo and deployed with the site
(GitHub Pages serves everything under `public/` at the site root, e.g.
`/retro-games/roms/<file>`). They power the **Built-in games** list on the
landing page and can be launched automatically on load.

## Add a ROM

1. Drop a ROM file into this folder, e.g. `Super Mario Bros. + Duck Hunt (USA).nes`.
2. Add an entry to `manifest.json`:

   ```json
   {
     "roms": [
       {
         "name": "Super Mario Bros. + Duck Hunt",
         "file": "Super Mario Bros. + Duck Hunt (USA).nes",
         "system": "nes",
         "default": true
       }
     ]
   }
   ```

   - `file` must match the file name exactly (it is URL-encoded automatically).
   - `system` is `nes` or `snes`.
   - `default: true` makes that ROM load automatically on first visit. Set it on
     at most one entry.

3. Commit both the ROM and the updated `manifest.json`. The next push to `main`
   redeploys them via `.github/workflows/deploy-pages.yml`.

## Legal note

This project does **not** distribute copyrighted ROMs or BIOS files. Only commit
games you have the legal right to use and redistribute. The included
`flappybird.nes` is a freely distributable homebrew title (from the
[retrobrews](https://github.com/retrobrews) collection).
