import type { SystemId } from './cores'

export interface LibraryRom {
  name: string
  file: string
  system: SystemId
  /** When true, this ROM is launched automatically on first load. */
  default?: boolean
}

interface LibraryManifest {
  roms?: LibraryRom[]
}

/**
 * Base path the app is served from. Set by Vite's `base` option so that
 * bundled ROMs resolve correctly both locally and on GitHub Pages.
 */
function basePath(): string {
  return import.meta.env.BASE_URL
}

/** Absolute URL for a ROM committed under `public/roms/`. */
export function romUrl(file: string): string {
  return `${basePath()}roms/${encodeURIComponent(file)}`
}

/**
 * Load the list of bundled ROMs from `public/roms/manifest.json`.
 * Returns an empty list when the manifest is missing or malformed so the
 * app still works without any committed ROMs.
 */
export async function fetchLibrary(): Promise<LibraryRom[]> {
  try {
    const res = await fetch(`${basePath()}roms/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) return []
    const data = (await res.json()) as LibraryManifest
    if (!Array.isArray(data.roms)) return []
    return data.roms.filter(
      (rom): rom is LibraryRom =>
        !!rom &&
        typeof rom.name === 'string' &&
        typeof rom.file === 'string' &&
        (rom.system === 'nes' || rom.system === 'snes'),
    )
  } catch {
    return []
  }
}
