import type { Nostalgist } from 'nostalgist'
import {
  DEFAULT_ARCADE_CORE,
  arcadeRomBasename,
  coreLabel,
  inferArcadeCoreForRom,
} from './cores'

const SETTLE_MS = 3500
/** Minimum non-black sample ratio to treat the frame as rendered content. */
const MIN_CONTENT_RATIO = 0.002

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Sample a RetroArch PNG screenshot; true when the frame is essentially blank/black. */
export async function isScreenshotMostlyBlack(blob: Blob): Promise<boolean> {
  if (blob.size < 1800) return true

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return false
  }

  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    return false
  }

  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const { width, height } = canvas
  const step = Math.max(4, Math.floor(Math.min(width, height) / 32))
  let nonBlack = 0
  let total = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
      total += 1
      if (r > 12 || g > 12 || b > 12) nonBlack += 1
    }
  }

  return total > 0 && nonBlack / total < MIN_CONTENT_RATIO
}

/** Coin + start — helps boards stuck at CREDITS 0 and some boot screens. */
export async function primeArcadeInput(nostalgist: Nostalgist): Promise<void> {
  await delay(400)
  nostalgist.pressDown('select')
  nostalgist.pressUp('select')
  await delay(200)
  nostalgist.pressDown('start')
  nostalgist.pressUp('start')
}

export async function arcadeScreenLooksBlank(nostalgist: Nostalgist): Promise<boolean> {
  await delay(SETTLE_MS)
  try {
    const blob = await nostalgist.screenshot()
    return await isScreenshotMostlyBlack(blob)
  } catch {
    return false
  }
}

export function arcadeLoadErrorMessage(core: string, romName?: string): string {
  const base = romName ? arcadeRomBasename(romName) : ''
  if (base.startsWith('kov2')) {
    if (core.startsWith('fbalpha')) {
      return (
        `Could not load ${romName} with FB Alpha 2012. Use an FBA-format (not MAME 0.22x) ROM set. ` +
        `For split sets, select pgm.zip together with kov2.zip (PGM BIOS: pgm_t01s.rom, pgm_m01s.rom, pgm_p01s.u20, pgm_p02s.u20).`
      )
    }
    return (
      `Knights of Valour 2 (${romName}) needs core "FB Alpha 2012" — it is not in MAME 2003-Plus ` +
      `(that core only has the first KOV / Sangoku Senki). Use an FBA-format kov2.zip and, for split sets, ` +
      `select pgm.zip together with the game (PGM BIOS).`
    )
  }
  const suggested = romName ? inferArcadeCoreForRom(romName) : null
  if (suggested && suggested !== core) {
    return (
      `"${romName}" likely needs core "${coreLabel(suggested)}" instead of "${coreLabel(core)}". ` +
      `Change core in Advanced settings, Apply & relaunch, and include any required BIOS zip (e.g. pgm.zip, neogeo.zip).`
    )
  }
  return (
    `This arcade core ("${coreLabel(core)}") did not render the game (black screen). ` +
    `Pick a core that matches your ROM set: MAME .zip → MAME 2003-Plus; Neo Geo → FB Alpha 2012 Neo Geo (+ neogeo.zip); ` +
    `PGM / KOV2 → FB Alpha 2012 (+ pgm.zip). Change core in Advanced settings and reload.`
  )
}

/** Retry generic/wrong MAME-family picks with the default Plus core before failing. */
export function shouldRetryWithDefaultMame(core: string): boolean {
  if (core === DEFAULT_ARCADE_CORE) return false
  if (core.startsWith('mame')) return true
  return false
}

/** When MAME 2003-Plus cannot run a ROM, try FB Alpha 2012 for known PGM-style sets. */
export function arcadeFallbackCore(currentCore: string, romName?: string): string | null {
  const suggested = romName ? inferArcadeCoreForRom(romName) : null
  if (!suggested || suggested === currentCore) return null
  if (
    suggested === 'fbalpha2012' &&
    (currentCore.startsWith('mame') || currentCore === DEFAULT_ARCADE_CORE)
  ) {
    return 'fbalpha2012'
  }
  return null
}
