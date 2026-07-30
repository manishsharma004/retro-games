import { useEffect, type RefObject } from 'react'

/**
 * Suppress browser touch gestures (context menu, pinch-zoom) on the play surface
 * so long-press and multi-touch do not interrupt gameplay.
 */
export function usePreventGameTouchGestures(
  targetRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const el = targetRef.current
    if (!el) return

    const onContextMenu = (e: Event) => e.preventDefault()

    const onTouchStart = (e: Event) => {
      if (e instanceof TouchEvent && e.touches.length > 1) e.preventDefault()
    }

    const opts: AddEventListenerOptions = { passive: false }
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('touchstart', onTouchStart, opts)

    return () => {
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('touchstart', onTouchStart, opts)
    }
  }, [targetRef, enabled])
}
