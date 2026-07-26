import type { Nostalgist } from 'nostalgist'

/** Fixed emulator frame size — matches the known-good smoke test. */
export const CANVAS_LAYOUT_WIDTH = 800
export const CANVAS_LAYOUT_HEIGHT = 600

/** @deprecated alias */
export const CANVAS_BUFFER_WIDTH = CANVAS_LAYOUT_WIDTH
/** @deprecated alias */
export const CANVAS_BUFFER_HEIGHT = CANVAS_LAYOUT_HEIGHT

/**
 * Scale the fixed 800×600 stage (iframe) to fit the host. The iframe document
 * owns the real canvas at a stable 800×600 — do not touch its buffer from here.
 */
export function lockEmulatorStage(stage: HTMLElement, host: HTMLElement): () => void {
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

/** @deprecated */
export function lockEmulatorCanvas(
  _nostalgist: Nostalgist,
  _canvas: HTMLCanvasElement,
  stage: HTMLElement,
  host: HTMLElement,
): () => void {
  return lockEmulatorStage(stage, host)
}
