import { useCallback, useEffect, useState, type RefObject } from 'react'

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

function nativeFullscreenEnabled(): boolean {
  const doc = document as FullscreenDocument
  return Boolean(document.fullscreenEnabled || doc.webkitFullscreenEnabled)
}

function requestNativeFullscreen(el: HTMLElement): Promise<void> {
  const target = el as FullscreenElement
  if (typeof target.requestFullscreen === 'function') {
    return target.requestFullscreen()
  }
  if (typeof target.webkitRequestFullscreen === 'function') {
    return Promise.resolve(target.webkitRequestFullscreen())
  }
  return Promise.reject(new Error('Fullscreen API unavailable'))
}

function exitNativeFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument
  if (typeof document.exitFullscreen === 'function' && document.fullscreenElement) {
    return document.exitFullscreen()
  }
  if (typeof doc.webkitExitFullscreen === 'function' && doc.webkitFullscreenElement) {
    return Promise.resolve(doc.webkitExitFullscreen())
  }
  return Promise.resolve()
}

/**
 * Fullscreen for the play surface. Uses the native Fullscreen API when the
 * browser allows it (desktop / iPadOS). On iPhone Safari — which does not
 * expose Fullscreen for arbitrary DOM nodes — falls back to a CSS fixed
 * viewport overlay (apply `player--fullscreen` when `isFullscreen` is true
 * and the element is not the document fullscreenElement).
 */
export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  /** True when using the CSS fixed-viewport fallback (iOS Safari, etc.). */
  const [cssFallback, setCssFallback] = useState(false)

  useEffect(() => {
    const onChange = () => {
      const active = getFullscreenElement() === targetRef.current
      setIsFullscreen(active || cssFallback)
      if (active) setCssFallback(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [targetRef, cssFallback])

  useEffect(() => {
    if (!cssFallback) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCssFallback(false)
        setIsFullscreen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [cssFallback])

  const enter = useCallback(async () => {
    const el = targetRef.current
    if (!el || getFullscreenElement() || cssFallback) return

    if (nativeFullscreenEnabled()) {
      try {
        await requestNativeFullscreen(el)
        return
      } catch (err) {
        console.warn('Native fullscreen failed; using CSS fallback', err)
      }
    }

    setCssFallback(true)
    setIsFullscreen(true)
  }, [targetRef, cssFallback])

  const exit = useCallback(async () => {
    if (getFullscreenElement()) {
      try {
        await exitNativeFullscreen()
      } catch (err) {
        console.error('Exit fullscreen failed', err)
      }
      return
    }
    if (cssFallback) {
      setCssFallback(false)
      setIsFullscreen(false)
    }
  }, [cssFallback])

  const toggle = useCallback(async () => {
    if (getFullscreenElement() || cssFallback) {
      await exit()
    } else {
      await enter()
    }
  }, [enter, exit, cssFallback])

  return { isFullscreen, cssFallback, enter, exit, toggle }
}
