/**
 * Fixed emulator canvas layout — matches the known-good smoke test.
 *
 * Do NOT apply CSS transform to the canvas or an ancestor. RetroArch reads
 * ResizeObserver devicePixelContentBoxSize; transforms change that size and
 * cause `RuntimeError: memory access out of bounds` in the WASM main loop.
 *
 * Visual fit: center the 800×600 box in the host (letterbox). Fullscreen can
 * still center a larger host around the same fixed stage.
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

export function prepareCanvasLayout(canvas: HTMLCanvasElement): void {
  if (!canvas.id) canvas.id = 'canvas'
  canvas.style.setProperty('width', `${CANVAS_LAYOUT_WIDTH}px`, 'important')
  canvas.style.setProperty('height', `${CANVAS_LAYOUT_HEIGHT}px`, 'important')
  canvas.style.setProperty('max-width', 'none', 'important')
  canvas.style.setProperty('max-height', 'none', 'important')
  canvas.style.setProperty('display', 'block', 'important')
  canvas.style.setProperty('position', 'static', 'important')
  canvas.style.setProperty('transform', 'none', 'important')
  canvas.style.setProperty('object-fit', 'fill', 'important')
}
