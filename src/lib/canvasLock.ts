import type { Nostalgist } from 'nostalgist'

/** Minimum stage layout before launching (avoids parked / zero-size races). */
export const MIN_STAGE_WIDTH = 160
export const MIN_STAGE_HEIGHT = 120

export function readStageSize(stage: HTMLElement): { width: number; height: number } | null {
  const width = stage.clientWidth
  const height = stage.clientHeight
  if (width < MIN_STAGE_WIDTH || height < MIN_STAGE_HEIGHT) return null
  return { width, height }
}

/** Ensure canvas fills the stage via CSS (no fixed px, no transform). */
export function prepareResponsiveCanvas(canvas: HTMLCanvasElement): void {
  if (!canvas.id) canvas.id = 'canvas'
  canvas.style.setProperty('width', '100%', 'important')
  canvas.style.setProperty('height', '100%', 'important')
  canvas.style.setProperty('display', 'block', 'important')
  canvas.style.setProperty('position', 'static', 'important')
  canvas.style.setProperty('transform', 'none', 'important')
  canvas.style.setProperty('object-fit', 'contain', 'important')
  canvas.style.setProperty('max-width', 'none', 'important')
  canvas.style.setProperty('max-height', 'none', 'important')
}

/**
 * Keep Nostalgist / RetroArch buffer in sync when the stage is resized.
 * Uses real CSS layout metrics only — never CSS transform on the canvas tree.
 */
export function attachStageResizeSync(
  nostalgist: Nostalgist,
  stage: HTMLElement,
): () => void {
  let raf = 0
  let lastW = 0
  let lastH = 0

  const sync = () => {
    const size = readStageSize(stage)
    if (!size) return
    if (size.width === lastW && size.height === lastH) return
    lastW = size.width
    lastH = size.height
    try {
      nostalgist.resize(size)
    } catch {
      // ignore transient resize during teardown
    }
  }

  const schedule = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(sync)
  }

  const ro = new ResizeObserver(schedule)
  ro.observe(stage)
  window.addEventListener('resize', schedule)
  schedule()

  return () => {
    ro.disconnect()
    window.removeEventListener('resize', schedule)
    cancelAnimationFrame(raf)
  }
}
