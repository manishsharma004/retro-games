import { SYSTEMS, type SystemId } from './cores'

/** Title shown on a cover, taken from the file name. */
export function shelfTitle(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/-/g, ' ').trim()
  return base || fileName
}

/** Stable unsigned hash for cover colors. */
export function coverSeed(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const PALETTES: Array<[string, string, string]> = [
  ['#1c2436', '#3d5a80', '#e8eef8'],
  ['#241c28', '#6d4c6a', '#f3e6ef'],
  ['#1a2420', '#3d6b58', '#e5f3ec'],
  ['#2a2118', '#8a5a32', '#f6ead8'],
  ['#1c1e2e', '#4a4e8a', '#e6e7f6'],
  ['#221818', '#8a3d3d', '#f8e6e6'],
]

export async function renderCover(
  title: string,
  system: SystemId,
  source?: ImageBitmap | null,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a cover')

  const seed = coverSeed(`${system}:${title}`)
  const [base, accent, ink] = PALETTES[seed % PALETTES.length]

  ctx.fillStyle = base
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (source) {
    const scale = Math.max(canvas.width / source.width, canvas.height / source.height)
    const width = source.width * scale
    const height = source.height * scale
    ctx.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    const shade = ctx.createLinearGradient(0, canvas.height * 0.45, 0, canvas.height)
    shade.addColorStop(0, 'rgba(8, 10, 14, 0)')
    shade.addColorStop(1, 'rgba(8, 10, 14, 0.88)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 8
    const bands = 4 + (seed % 4)
    for (let i = 0; i < bands; i += 1) {
      const y = 70 + ((seed >> (i * 3)) % 280)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(90, y - 40, 220, y + 50, 360, y - 10)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = accent
    ctx.fillRect(28, 28, 72, 8)
  }

  ctx.fillStyle = ink
  ctx.font = '600 18px "Space Grotesk", sans-serif'
  ctx.fillText(SYSTEMS[system].label.toUpperCase(), 28, source ? 64 : 78)

  ctx.fillStyle = '#f4f7fb'
  ctx.font = '650 34px "Space Grotesk", sans-serif'
  const lines = wrapText(ctx, title, 300).slice(0, 4)
  let y = source ? 360 : 250
  for (const line of lines) {
    ctx.fillText(line, 28, y)
    y += 40
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not save the cover')
  return blob
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : [text]
}
