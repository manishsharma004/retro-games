import type { Nostalgist } from 'nostalgist'

/** Fixed backing-store + CSS layout size for the emulator canvas. */
export const CANVAS_BUFFER_WIDTH = 800
export const CANVAS_BUFFER_HEIGHT = 600

type ModuleCanvas = {
  setCanvasSize?: (width: number, height: number) => void
  canvas?: HTMLCanvasElement
  _emscripten_set_canvas_element_size?: (target: unknown, w: number, h: number) => number
  _emscripten_set_canvas_size?: (w: number, h: number) => void
}

/**
 * Install BEFORE Nostalgist.launch so RetroArch cannot observe real stage size.
 * Filters ResizeObserver notifications for the emulator canvas.
 */
export function installCanvasResizeObserverGuard(canvas: HTMLCanvasElement): () => void {
  const OriginalRO = window.ResizeObserver
  window.ResizeObserver = class GuardedResizeObserver extends OriginalRO {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        const filtered = entries.filter((entry) => entry.target !== canvas)
        if (filtered.length === 0) return
        callback(filtered, observer)
      })
    }
  } as typeof ResizeObserver

  return () => {
    window.ResizeObserver = OriginalRO
  }
}

/**
 * After launch: freeze buffer size, use fixed CSS px (not 100%), scale with
 * transform so visuals fill the stage without changing layout metrics RA reads.
 */
export function lockEmulatorCanvas(
  nostalgist: Nostalgist,
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
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

  const Module = (() => {
    try {
      return nostalgist.getEmscriptenModule() as ModuleCanvas
    } catch {
      return null
    }
  })()

  // Initial buffer via Emscripten if available.
  try {
    if (typeof Module?.setCanvasSize === 'function') {
      Module.setCanvasSize(bufferWidth, bufferHeight)
    } else {
      writeBufferNative()
    }
  } catch {
    writeBufferNative()
  }

  // CRITICAL: real CSS layout size must be the buffer size — NOT 100% of stage.
  // ResizeObserver contentRect follows layout, not our clientWidth overrides.
  canvas.style.setProperty('width', `${bufferWidth}px`, 'important')
  canvas.style.setProperty('height', `${bufferHeight}px`, 'important')
  canvas.style.setProperty('max-width', 'none', 'important')
  canvas.style.setProperty('max-height', 'none', 'important')
  canvas.style.setProperty('position', 'absolute', 'important')
  canvas.style.setProperty('inset', 'auto', 'important')
  canvas.style.setProperty('left', '50%', 'important')
  canvas.style.setProperty('top', '50%', 'important')
  canvas.style.setProperty('right', 'auto', 'important')
  canvas.style.setProperty('bottom', 'auto', 'important')
  canvas.style.setProperty('object-fit', 'fill', 'important')
  canvas.style.setProperty('transform-origin', 'center center', 'important')

  // Scale visually; transform does not change clientWidth / RO contentRect.
  const fit = () => {
    const rect = stage.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const scale = Math.min(rect.width / bufferWidth, rect.height / bufferHeight)
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

  // Freeze attribute accessors.
  if (nativeWidth?.set && nativeHeight?.set) {
    try {
      Object.defineProperty(canvas, 'width', {
        configurable: true,
        enumerable: true,
        get: () => bufferWidth,
        set: () => {
          /* ignore RA writes */
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

  // Clamp Module.setCanvasSize.
  if (Module && typeof Module.setCanvasSize === 'function') {
    const original = Module.setCanvasSize.bind(Module)
    Module.setCanvasSize = (width: number, height: number) => {
      if (width === bufferWidth && height === bufferHeight) {
        try {
          writeBufferNative()
          original(bufferWidth, bufferHeight)
        } catch {
          writeBufferNative()
        }
      }
      // Drop stage-sized requests (1026×769 etc.).
    }
    cleanups.push(() => {
      Module.setCanvasSize = original
    })
  }

  // Clamp low-level Emscripten canvas size helpers if present.
  if (Module && typeof Module._emscripten_set_canvas_element_size === 'function') {
    const original = Module._emscripten_set_canvas_element_size.bind(Module)
    Module._emscripten_set_canvas_element_size = (_target, w, h) => {
      if (w === bufferWidth && h === bufferHeight) {
        try {
          return original(_target, bufferWidth, bufferHeight)
        } catch {
          return 0
        }
      }
      return 0
    }
    cleanups.push(() => {
      Module._emscripten_set_canvas_element_size = original
    })
  }
  if (Module && typeof Module._emscripten_set_canvas_size === 'function') {
    const original = Module._emscripten_set_canvas_size.bind(Module)
    Module._emscripten_set_canvas_size = (w, h) => {
      if (w === bufferWidth && h === bufferHeight) {
        try {
          original(bufferWidth, bufferHeight)
        } catch {
          // ignore
        }
      }
    }
    cleanups.push(() => {
      Module._emscripten_set_canvas_size = original
    })
  }

  // Re-assert native buffer after traps are installed.
  writeBufferNative()

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
