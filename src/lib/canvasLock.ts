import type { Nostalgist } from 'nostalgist'

/**
 * Fixed CSS *layout* size for the emulator canvas.
 *
 * RetroArch (`PlatformEmscriptenWatchCanvasSizeAndDpr`) writes the GL backing
 * store from ResizeObserver (`devicePixelContentBoxSize` or
 * `contentRect × devicePixelRatio`) and stores that size in C as the
 * framebuffer dimensions. Wild browser zoom / cloud DPR makes that enormous
 * or desynced → `RuntimeError: memory access out of bounds` in the main loop.
 *
 * Strategy:
 * 1. Fixed 800×600 CSS layout (no width/height 100%).
 * 2. Clamp RA’s `_platform_emscripten_update_canvas_dimensions_cb` so C-side
 *    fb size and the canvas element stay 800×600.
 * 3. Scale visually with CSS transform only.
 *
 * Do not redefine `window.devicePixelRatio` (breaks WebGL vs RA).
 * Do not freeze `canvas.width`/`height` accessors (desyncs GL).
 */
export const CANVAS_LAYOUT_WIDTH = 800
export const CANVAS_LAYOUT_HEIGHT = 600

/** @deprecated alias */
export const CANVAS_BUFFER_WIDTH = CANVAS_LAYOUT_WIDTH
/** @deprecated alias */
export const CANVAS_BUFFER_HEIGHT = CANVAS_LAYOUT_HEIGHT

export function canvasBackingStoreSize(
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
): { width: number; height: number } {
  return { width: layoutWidth, height: layoutHeight }
}

/** Emscripten Module hooks passed to Nostalgist.launch({ emscriptenModule }). */
export function createCanvasSizeEmscriptenHooks(
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
): Record<string, unknown> {
  const clampCb = (Module: Record<string, unknown>) => {
    const key = '_platform_emscripten_update_canvas_dimensions_cb'
    const original = Module[key]
    if (typeof original !== 'function') return
    if ((original as { __rgClamped?: boolean }).__rgClamped) return

    const clamped = (_width: number, _height: number, dprPtr: number) => {
      try {
        const setValue = Module.setValue as
          | ((ptr: number, value: number, type: string) => void)
          | undefined
        if (typeof setValue === 'function' && dprPtr) {
          setValue(dprPtr, 1, 'double')
        }
      } catch {
        // ignore
      }
      return (original as (w: number, h: number, p: number) => unknown)(
        layoutWidth,
        layoutHeight,
        dprPtr,
      )
    }
    ;(clamped as { __rgClamped?: boolean }).__rgClamped = true
    Module[key] = clamped
  }

  return {
    // preRun runs before WASM exports exist; chain onRuntimeInitialized so we
    // wrap the canvas-dimension callback before RetroArch main() watches size.
    preRun: [
      (Module: Record<string, unknown>) => {
        const prev = Module.onRuntimeInitialized as (() => void) | undefined
        Module.onRuntimeInitialized = () => {
          clampCb(Module)
          prev?.call(Module)
        }
      },
    ],
  }
}

export function prepareCanvasLayout(canvas: HTMLCanvasElement): void {
  if (!canvas.id) canvas.id = 'canvas'
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
 * Rewrite ResizeObserver notifications for the emulator canvas so the JS side
 * of WatchCanvas also computes 800×600 (not layout×real DPR).
 */
export function installEmulatorPixelRatioGuard(
  canvas: HTMLCanvasElement,
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
): () => void {
  const OriginalRO = window.ResizeObserver
  window.ResizeObserver = class EmulatorGuardedRO extends OriginalRO {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        const mapped = entries.map((entry) => {
          if (entry.target !== canvas) return entry
          const contentRect = new DOMRectReadOnly(0, 0, layoutWidth, layoutHeight)
          const box = [{ inlineSize: layoutWidth, blockSize: layoutHeight }]
          return {
            target: entry.target,
            contentRect,
            borderBoxSize: box as unknown as ReadonlyArray<ResizeObserverSize>,
            contentBoxSize: box as unknown as ReadonlyArray<ResizeObserverSize>,
            devicePixelContentBoxSize:
              box as unknown as ReadonlyArray<ResizeObserverSize>,
          } as ResizeObserverEntry
        })
        callback(mapped, observer)
      })
    }
  } as typeof ResizeObserver

  return () => {
    window.ResizeObserver = OriginalRO
  }
}

/**
 * After launch: fixed CSS layout + transform scale. Re-assert buffer size once.
 */
export function lockEmulatorCanvas(
  nostalgist: Nostalgist,
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
): () => void {
  const cleanups: Array<() => void> = []

  prepareCanvasLayout(canvas)
  canvas.style.setProperty('width', `${layoutWidth}px`, 'important')
  canvas.style.setProperty('height', `${layoutHeight}px`, 'important')

  try {
    nostalgist.resize({ width: layoutWidth, height: layoutHeight })
  } catch {
    try {
      canvas.width = layoutWidth
      canvas.height = layoutHeight
    } catch {
      // ignore
    }
  }

  try {
    const Module = nostalgist.getEmscriptenModule() as {
      setCanvasSize?: (w: number, h: number) => void
      _platform_emscripten_update_canvas_dimensions_cb?: (
        w: number,
        h: number,
        p: number,
      ) => unknown
      setValue?: (ptr: number, value: number, type: string) => void
    }

    // Re-clamp in case preRun missed the export.
    const key = '_platform_emscripten_update_canvas_dimensions_cb'
    const dimCb = Module[key]
    if (typeof dimCb === 'function' && !(dimCb as { __rgClamped?: boolean }).__rgClamped) {
      const original = dimCb.bind(Module)
      const clamped = (_w: number, _h: number, dprPtr: number) => {
        try {
          if (typeof Module.setValue === 'function' && dprPtr) {
            Module.setValue(dprPtr, 1, 'double')
          }
        } catch {
          // ignore
        }
        return original(layoutWidth, layoutHeight, dprPtr)
      }
      ;(clamped as { __rgClamped?: boolean }).__rgClamped = true
      Module[key] = clamped
    }

    if (typeof Module.setCanvasSize === 'function') {
      const original = Module.setCanvasSize.bind(Module)
      let lastW = -1
      let lastH = -1
      Module.setCanvasSize = (_w: number, _h: number) => {
        if (lastW === layoutWidth && lastH === layoutHeight) return
        lastW = layoutWidth
        lastH = layoutHeight
        try {
          original(layoutWidth, layoutHeight)
        } catch {
          canvas.width = layoutWidth
          canvas.height = layoutHeight
        }
      }
      cleanups.push(() => {
        Module.setCanvasSize = original
      })
    }
  } catch {
    // Module not ready
  }

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

  window.addEventListener('resize', fit)
  cleanups.push(() => window.removeEventListener('resize', fit))

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

/** @deprecated */
export function installCanvasResizeObserverGuard(
  canvas: HTMLCanvasElement,
): () => void {
  return installEmulatorPixelRatioGuard(canvas)
}
