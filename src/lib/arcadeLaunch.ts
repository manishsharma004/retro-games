import type { Nostalgist } from 'nostalgist'
import { DEFAULT_ARCADE_CORE, coreLabel } from './cores'

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

export function arcadeLoadErrorMessage(core: string): string {
  return (
    `This arcade core ("${coreLabel(core)}") did not render the game (black screen). ` +
    `Pick a core that matches your ROM set: MAME .zip → MAME 2003-Plus; Neo Geo → FB Alpha 2012 Neo Geo (+ neogeo.zip); ` +
    `CPS → FB Alpha CPS-1/2. Change core in Advanced settings and reload.`
  )
}

/** Retry generic/wrong MAME-family picks with the default Plus core before failing. */
export function shouldRetryWithDefaultMame(core: string): boolean {
  if (core === DEFAULT_ARCADE_CORE) return false
  if (core.startsWith('mame')) return true
  if (core === 'fbalpha2012') return true
  return false
}
