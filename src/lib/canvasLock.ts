import type { Nostalgist } from 'nostalgist'

/**
 * Fixed CSS layout for the emulator — mirrors the working smoke test:
 * an 800×600 box with CSS width/height 800px/600px. RetroArch may set the
 * backing store to ~layout×DPR; that is fine and must not be fought.
 *
 * The React app previously used width/height 100% on a flex stage that could
 * collapse (clientHeight ≈ 30) or chase the viewport via ResizeObserver, which
 * OOB'd the WASM heap. Scale the fixed stage with transform instead.
 */
export const CANVAS_LAYOUT_WIDTH = 800
export const CANVAS_LAYOUT_HEIGHT = 600

/** @deprecated alias */
export const CANVAS_BUFFER_WIDTH = CANVAS_LAYOUT_WIDTH
/** @deprecated alias */
export const CANVAS_BUFFER_HEIGHT = CANVAS_LAYOUT_HEIGHT

export function canvasBackingStoreSize(): { width: number; height: number } {
  return { width: CANVAS_LAYOUT_WIDTH, height: CANVAS_LAYOUT_HEIGHT }
}

/** Ensure canvas CSS matches the smoke test before Nostalgist.launch. */
export function prepareCanvasLayout(canvas: HTMLCanvasElement): void {
  if (!canvas.id) canvas.id = 'canvas'
  canvas.style.setProperty('width', `${CANVAS_LAYOUT_WIDTH}px`, 'important')
  canvas.style.setProperty('height', `${CANVAS_LAYOUT_HEIGHT}px`, 'important')
  canvas.style.setProperty('max-width', 'none', 'important')
  canvas.style.setProperty('max-height', 'none', 'important')
  canvas.style.setProperty('display', 'block', 'important')
  canvas.style.setProperty('position', 'static', 'important')
  canvas.style.setProperty('inset', 'auto', 'important')
  canvas.style.setProperty('transform', 'none', 'important')
  canvas.style.setProperty('object-fit', 'fill', 'important')
}

/**
 * Scale the fixed 800×600 stage to fit the host. Does not touch canvas buffer
 * size or RetroArch APIs.
 */
export function lockEmulatorCanvas(
  _nostalgist: Nostalgist,
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  host: HTMLElement,
): () => void {
  prepareCanvasLayout(canvas)

  stage.style.setProperty('width', `${CANVAS_LAYOUT_WIDTH}px`, 'important')
  stage.style.setProperty('height', `${CANVAS_LAYOUT_HEIGHT}px`, 'important')
  stage.style.setProperty('transform-origin', 'center center', 'important')

  const fit = () => {
    const rect = host.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const scale = Math.min(
      rect.width / CANVAS_LAYOUT_WIDTH,
      rect.height / CANVAS_LAYOUT_HEIGHT,
    )
    stage.style.setProperty('transform', `scale(${scale})`, 'important')
  }
  fit()
  const ro = new ResizeObserver(() => {
    requestAnimationFrame(fit)
  })
  ro.observe(host)
  window.addEventListener('resize', fit)

  return () => {
    ro.disconnect()
    window.removeEventListener('resize', fit)
  }
}
