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

function clearFauxViewportStyles(el: HTMLElement) {
  el.style.removeProperty('top')
  el.style.removeProperty('left')
  el.style.removeProperty('width')
  el.style.removeProperty('height')
}

/**
 * Pin a faux-fullscreen element to the visual viewport. iOS Safari's layout
 * viewport is taller than what's on screen when the URL bar shows, which is
 * what caused the huge black gap + undersized stage in CSS fullscreen.
 */
function syncFauxViewport(el: HTMLElement) {
  const vv = window.visualViewport
  if (!vv) {
    el.style.top = '0px'
    el.style.left = '0px'
    el.style.width = '100%'
    el.style.height = '100%'
    return
  }
  el.style.top = `${vv.offsetTop}px`
  el.style.left = `${vv.offsetLeft}px`
  el.style.width = `${vv.width}px`
  el.style.height = `${vv.height}px`
}

/**
 * Fullscreen for the play surface. Uses the native Fullscreen API when the
 * browser allows it (desktop / iPadOS). On iPhone Safari — which does not
 * expose Fullscreen for arbitrary DOM nodes — falls back to a CSS fixed
 * viewport overlay (`player--fullscreen`), sized to the visual viewport.
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

    const el = targetRef.current
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyTop: body.style.top,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }

    html.classList.add('rg-faux-fullscreen')
    body.classList.add('rg-faux-fullscreen')
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.width = '100%'
    body.style.top = `-${prev.scrollY}px`

    const sync = () => {
      if (el) syncFauxViewport(el)
    }
    sync()

    const vv = window.visualViewport
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCssFallback(false)
        setIsFullscreen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      document.removeEventListener('keydown', onKeyDown)
      html.classList.remove('rg-faux-fullscreen')
      body.classList.remove('rg-faux-fullscreen')
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      body.style.position = prev.bodyPosition
      body.style.width = prev.bodyWidth
      body.style.top = prev.bodyTop
      window.scrollTo(prev.scrollX, prev.scrollY)
      if (el) clearFauxViewportStyles(el)
    }
  }, [cssFallback, targetRef])

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
