import type { Nostalgist } from 'nostalgist'

/**
 * Fixed CSS *layout* size for the emulator canvas.
 *
 * RetroArch's emscripten platform sets the WebGL backing store to
 * `layoutSize * devicePixelRatio` (see PlatformEmscriptenWatchCanvasSizeAndDpr).
 * CSS must stay fixed so ResizeObserver does not chase the stage size and enter
 * an infinite resize loop. Visual fill of the stage is done with transform only.
 */
export const CANVAS_LAYOUT_WIDTH = 800
export const CANVAS_LAYOUT_HEIGHT = 600

/** @deprecated Use CANVAS_LAYOUT_WIDTH — kept for call-site clarity during migration. */
export const CANVAS_BUFFER_WIDTH = CANVAS_LAYOUT_WIDTH
/** @deprecated Use CANVAS_LAYOUT_HEIGHT */
export const CANVAS_BUFFER_HEIGHT = CANVAS_LAYOUT_HEIGHT

/** Backing-store size RetroArch / Nostalgist should use (CSS layout × DPR). */
export function canvasBackingStoreSize(
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
  dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(layoutWidth * dpr)),
    height: Math.max(1, Math.round(layoutHeight * dpr)),
  }
}

/**
 * Ensure layout metrics RA reads (clientWidth / RO contentRect) match the fixed
 * CSS box *before* Nostalgist.launch. Do not freeze canvas.width/height — RA must
 * be free to set the DPR-scaled backing store.
 */
export function prepareCanvasLayout(canvas: HTMLCanvasElement): void {
  canvas.style.setProperty('width', `${CANVAS_LAYOUT_WIDTH}px`, 'important')
  canvas.style.setProperty('height', `${CANVAS_LAYOUT_HEIGHT}px`, 'important')
  canvas.style.setProperty('max-width', 'none', 'important')
  canvas.style.setProperty('max-height', 'none', 'important')
  canvas.style.setProperty('position', 'absolute', 'important')
  canvas.style.setProperty('left', '50%', 'important')
  canvas.style.setProperty('top', '50%', 'important')
  canvas.style.setProperty('right', 'auto', 'important')
  canvas.style.setProperty('bottom', 'auto', 'important')
  canvas.style.setProperty('inset', 'auto', 'important')
  canvas.style.setProperty('display', 'block', 'important')
  canvas.style.setProperty('object-fit', 'fill', 'important')
  canvas.style.setProperty('transform-origin', 'center center', 'important')
  canvas.style.setProperty(
    'transform',
    'translate(-50%, -50%) scale(1)',
    'important',
  )
}

/**
 * After launch: keep fixed CSS layout and scale with transform so the stage is
 * filled without changing layout metrics RetroArch reads.
 *
 * Intentionally does NOT:
 * - freeze canvas.width / height (desyncs GL buffer from RA's DPR size → OOB)
 * - clamp Module.setCanvasSize to CSS pixels (same desync)
 * - filter ResizeObserver on the canvas (blocks RA from correcting size)
 */
export function lockEmulatorCanvas(
  _nostalgist: Nostalgist,
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
): () => void {
  const cleanups: Array<() => void> = []

  prepareCanvasLayout(canvas)
  // Re-assert layout sizes in case Nostalgist/RA tweaked style during init.
  canvas.style.setProperty('width', `${layoutWidth}px`, 'important')
  canvas.style.setProperty('height', `${layoutHeight}px`, 'important')

  const fit = () => {
    const rect = stage.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const scale = Math.min(rect.width / layoutWidth, rect.height / layoutHeight)
    canvas.style.setProperty(
      'transform',
      `translate(-50%, -50%) scale(${scale})`,
      'important',
    )
  }
  fit()
  const stageRo = new ResizeObserver(() => {
    requestAnimationFrame(fit)
  })
  stageRo.observe(stage)
  cleanups.push(() => stageRo.disconnect())

  // If the browser zoom / DPR changes, ask RA to re-measure. Fixed CSS keeps
  // layout stable; RA's own observer updates the backing store.
  const onWindowResize = () => {
    requestAnimationFrame(fit)
  }
  window.addEventListener('resize', onWindowResize)
  cleanups.push(() => window.removeEventListener('resize', onWindowResize))

  return () => {
    for (const fn of cleanups.reverse()) {
      try {
        fn()
      } catch {
        // ignore
      }
    }
  }
}

/**
 * @deprecated No longer used — filtering RO caused RA's internal fb size to
 * diverge from the real GL buffer. Kept as a no-op so older call sites compile
 * until fully removed.
 */
export function installCanvasResizeObserverGuard(
  _canvas: HTMLCanvasElement,
): () => void {
  return () => {}
}
