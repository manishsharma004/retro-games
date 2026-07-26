import type { Nostalgist } from 'nostalgist'

/** Fixed backing-store resolution reported to RetroArch / Emscripten. */
export const CANVAS_BUFFER_WIDTH = 800
export const CANVAS_BUFFER_HEIGHT = 600

/**
 * Stop RetroArch's canvas ResizeObserver loop.
 *
 * RA does the equivalent of `canvas.width = canvas.clientWidth` whenever the
 * canvas layout size changes. With CSS `width/height: 100%` that equals the
 * stage size (e.g. 1026×769), so every setCanvasSize mutates state, re-fires
 * the observer, logs "Setting real canvas size", and eventually OOBs WASM.
 *
 * Keep CSS 100% for visuals, but report a fixed client/offset size to RA and
 * ignore further buffer resize requests.
 */
export function lockEmulatorCanvas(
  nostalgist: Nostalgist,
  canvas: HTMLCanvasElement,
  _stage: HTMLElement,
  bufferWidth = CANVAS_BUFFER_WIDTH,
  bufferHeight = CANVAS_BUFFER_HEIGHT,
): () => void {
  const cleanups: Array<() => void> = []

  const nativeWidth = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')
  const nativeHeight = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height')

  const writeBufferNative = () => {
    try {
      nativeWidth?.set?.call(canvas, bufferWidth)
      nativeHeight?.set?.call(canvas, bufferHeight)
    } catch {
      // ignore
    }
  }

  // 1) Set the real backing store BEFORE freezing accessors.
  try {
    const Module = nostalgist.getEmscriptenModule() as {
      setCanvasSize?: (width: number, height: number) => void
    }
    if (typeof Module.setCanvasSize === 'function') {
      Module.setCanvasSize(bufferWidth, bufferHeight)
    } else {
      writeBufferNative()
    }
  } catch {
    writeBufferNative()
  }

  // 2) Lie about layout metrics so RA always targets the same size.
  for (const [prop, value] of [
    ['clientWidth', bufferWidth],
    ['clientHeight', bufferHeight],
    ['offsetWidth', bufferWidth],
    ['offsetHeight', bufferHeight],
  ] as const) {
    try {
      Object.defineProperty(canvas, prop, {
        configurable: true,
        enumerable: true,
        get: () => value,
      })
      cleanups.push(() => {
        try {
          delete (canvas as unknown as Record<string, unknown>)[prop]
        } catch {
          // ignore
        }
      })
    } catch {
      // ignore
    }
  }

  // 3) Stable getBoundingClientRect size (some shells use this instead of clientWidth).
  const protoGBCR = Element.prototype.getBoundingClientRect
  canvas.getBoundingClientRect = () => {
    const r = protoGBCR.call(canvas)
    return new DOMRect(r.x, r.y, bufferWidth, bufferHeight)
  }
  cleanups.push(() => {
    delete (canvas as unknown as { getBoundingClientRect?: unknown }).getBoundingClientRect
  })

  // 4) Freeze width/height on this canvas instance (RA direct writes become no-ops).
  if (nativeWidth?.set && nativeHeight?.set) {
    try {
      Object.defineProperty(canvas, 'width', {
        configurable: true,
        enumerable: true,
        get: () => bufferWidth,
        set: () => {
          /* ignore */
        },
      })
      Object.defineProperty(canvas, 'height', {
        configurable: true,
        enumerable: true,
        get: () => bufferHeight,
        set: () => {
          /* ignore */
        },
      })
      cleanups.push(() => {
        Object.defineProperty(canvas, 'width', {
          configurable: true,
          enumerable: true,
          get: nativeWidth.get,
          set: nativeWidth.set,
        })
        Object.defineProperty(canvas, 'height', {
          configurable: true,
          enumerable: true,
          get: nativeHeight.get,
          set: nativeHeight.set,
        })
      })
    } catch {
      // ignore
    }
  }

  // 5) Make Module.setCanvasSize ignore stage-sized requests.
  try {
    const Module = nostalgist.getEmscriptenModule() as {
      setCanvasSize?: (width: number, height: number) => void
    }
    if (typeof Module.setCanvasSize === 'function') {
      const original = Module.setCanvasSize.bind(Module)
      Module.setCanvasSize = (width: number, height: number) => {
        if (width === bufferWidth && height === bufferHeight) {
          try {
            // Prefer native setters so instance width traps do not block us.
            writeBufferNative()
            original(bufferWidth, bufferHeight)
          } catch {
            writeBufferNative()
          }
        }
      }
      cleanups.push(() => {
        Module.setCanvasSize = original
      })
    }
  } catch {
    // ignore
  }

  // 6) Block new ResizeObserver.observe(canvas).
  const ROProto = ResizeObserver.prototype
  const originalObserve = ROProto.observe
  ROProto.observe = function patchedObserve(
    this: ResizeObserver,
    target: Element,
    options?: ResizeObserverOptions,
  ) {
    if (target === canvas) return
    return originalObserve.call(this, target, options)
  }
  cleanups.push(() => {
    ROProto.observe = originalObserve
  })

  // Visual fill from CSS.
  canvas.style.setProperty('width', '100%', 'important')
  canvas.style.setProperty('height', '100%', 'important')
  canvas.style.setProperty('position', 'absolute', 'important')
  canvas.style.setProperty('inset', '0', 'important')
  canvas.style.setProperty('object-fit', 'contain', 'important')

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
