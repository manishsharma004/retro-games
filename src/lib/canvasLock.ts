import type { Nostalgist } from 'nostalgist'

/**
 * Fixed CSS *layout* size for the emulator canvas.
 *
 * RetroArch sets the WebGL backing store from ResizeObserver, preferring
 * `devicePixelContentBoxSize` or `contentRect × devicePixelRatio`. A floating
 * DPR (browser zoom / cloud VM quirks) both causes resize thrash and can
 * request enormous GL buffers that blow the WASM heap (`memory access out of
 * bounds`).
 *
 * We keep layout fixed and force an effective DPR of 1 for the emulator so the
 * backing store stays equal to the CSS box.
 */
export const CANVAS_LAYOUT_WIDTH = 800
export const CANVAS_LAYOUT_HEIGHT = 600

/** Emulator always uses 1:1 CSS px → buffer px. */
export const EMULATOR_DEVICE_PIXEL_RATIO = 1

/** @deprecated alias */
export const CANVAS_BUFFER_WIDTH = CANVAS_LAYOUT_WIDTH
/** @deprecated alias */
export const CANVAS_BUFFER_HEIGHT = CANVAS_LAYOUT_HEIGHT

export function canvasBackingStoreSize(
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(layoutWidth * EMULATOR_DEVICE_PIXEL_RATIO)),
    height: Math.max(1, Math.round(layoutHeight * EMULATOR_DEVICE_PIXEL_RATIO)),
  }
}

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
 * Install BEFORE Nostalgist.launch.
 *
 * RetroArch's PlatformEmscriptenWatchCanvasSizeAndDpr multiplies layout by
 * devicePixelRatio (or reads devicePixelContentBoxSize). Spoof both so the
 * backing store stays at the fixed layout size regardless of browser zoom.
 */
export function installEmulatorPixelRatioGuard(
  canvas: HTMLCanvasElement,
  layoutWidth = CANVAS_LAYOUT_WIDTH,
  layoutHeight = CANVAS_LAYOUT_HEIGHT,
): () => void {
  const cleanups: Array<() => void> = []

  // Force window.devicePixelRatio → 1 for RA's JS callbacks.
  const dprDesc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      enumerable: true,
      get: () => EMULATOR_DEVICE_PIXEL_RATIO,
    })
    cleanups.push(() => {
      if (dprDesc) Object.defineProperty(window, 'devicePixelRatio', dprDesc)
      else delete (window as { devicePixelRatio?: number }).devicePixelRatio
    })
  } catch {
    // Some environments disallow redefining devicePixelRatio.
  }

  // Rewrite ResizeObserver notifications for the emulator canvas.
  const OriginalRO = window.ResizeObserver
  window.ResizeObserver = class EmulatorGuardedRO extends OriginalRO {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        const mapped = entries.map((entry) => {
          if (entry.target !== canvas) return entry
          const contentRect = new DOMRectReadOnly(0, 0, layoutWidth, layoutHeight)
          return {
            target: entry.target,
            contentRect,
            borderBoxSize: [
              { inlineSize: layoutWidth, blockSize: layoutHeight },
            ] as unknown as ReadonlyArray<ResizeObserverSize>,
            contentBoxSize: [
              { inlineSize: layoutWidth, blockSize: layoutHeight },
            ] as unknown as ReadonlyArray<ResizeObserverSize>,
            // Critical: RA prefers this when present — must be layout, not
            // layout × real DPR, or we recreate the OOB-sized buffer.
            devicePixelContentBoxSize: [
              {
                inlineSize: layoutWidth * EMULATOR_DEVICE_PIXEL_RATIO,
                blockSize: layoutHeight * EMULATOR_DEVICE_PIXEL_RATIO,
              },
            ] as unknown as ReadonlyArray<ResizeObserverSize>,
          } as ResizeObserverEntry
        })
        callback(mapped, observer)
      })
    }
  } as typeof ResizeObserver
  cleanups.push(() => {
    window.ResizeObserver = OriginalRO
  })

  // Belt-and-suspenders: layout metrics RA may poll before RO fires.
  const metric = (value: number) => ({
    configurable: true,
    enumerable: true,
    get: () => value,
  })
  try {
    Object.defineProperty(canvas, 'clientWidth', metric(layoutWidth))
    Object.defineProperty(canvas, 'clientHeight', metric(layoutHeight))
    Object.defineProperty(canvas, 'offsetWidth', metric(layoutWidth))
    Object.defineProperty(canvas, 'offsetHeight', metric(layoutHeight))
    cleanups.push(() => {
      for (const prop of [
        'clientWidth',
        'clientHeight',
        'offsetWidth',
        'offsetHeight',
      ] as const) {
        delete (canvas as unknown as Record<string, unknown>)[prop]
      }
    })
  } catch {
    // ignore
  }

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
 * After launch: fixed CSS layout + transform scale to fill the stage.
 * Does not freeze canvas.width/height — RA must set the (DPR-spoofed) buffer.
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

/** @deprecated use installEmulatorPixelRatioGuard */
export function installCanvasResizeObserverGuard(
  canvas: HTMLCanvasElement,
): () => void {
  return installEmulatorPixelRatioGuard(canvas)
}
