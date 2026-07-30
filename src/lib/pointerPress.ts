import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Pointer bindings for on-screen buttons. Handles long-press pointercancel,
 * lost capture, and double-tap when the first pointerup never arrives (common
 * on iOS Safari).
 */
export interface PointerPressBindings {
  onContextMenu: (e: ReactMouseEvent) => void
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  onPointerCancel: (e: ReactPointerEvent) => void
  onLostPointerCapture: (e: ReactPointerEvent) => void
}

export function createPointerPressBindings(opts: {
  disabled?: boolean
  isPressed: () => boolean
  getPointerId: () => number | null
  setPointerId: (id: number | null) => void
  press: () => void
  release: () => void
}): PointerPressBindings {
  const end = (pointerId: number) => {
    if (opts.getPointerId() !== pointerId) return
    opts.setPointerId(null)
    if (opts.isPressed()) opts.release()
  }

  return {
    onContextMenu: (e) => {
      e.preventDefault()
    },
    onPointerDown: (e) => {
      if (opts.disabled) return
      e.preventDefault()

      const prev = opts.getPointerId()
      if (prev !== null && prev !== e.pointerId && opts.isPressed()) {
        // New finger before the previous lift registered — avoid a stuck button.
        opts.setPointerId(null)
        opts.release()
      }

      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      opts.setPointerId(e.pointerId)
      if (!opts.isPressed()) opts.press()
    },
    onPointerUp: (e) => {
      if (opts.disabled) return
      e.preventDefault()
      end(e.pointerId)
    },
    onPointerCancel: (e) => {
      if (opts.disabled) return
      end(e.pointerId)
    },
    onLostPointerCapture: (e) => {
      if (opts.disabled) return
      end(e.pointerId)
    },
  }
}
