import { useCallback, useEffect, useState, type RefObject } from 'react'
import {
  fullscreenPlan,
  isPortraitBox,
  sidewaysFrame,
  type ViewportBox,
} from '../lib/mobilePlay'

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

type Orientable = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait') => Promise<void>
  unlock?: () => void
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

function readViewport(): ViewportBox {
  const vv = window.visualViewport
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    top: vv?.offsetTop ?? 0,
    left: vv?.offsetLeft ?? 0,
  }
}

function publishViewport(box: ViewportBox) {
  const root = document.documentElement
  root.style.setProperty('--app-vvw', `${Math.round(box.width)}px`)
  root.style.setProperty('--app-vvh', `${Math.round(box.height)}px`)
  root.style.setProperty('--app-vv-top', `${Math.round(box.top)}px`)
  root.style.setProperty('--app-vv-left', `${Math.round(box.left)}px`)
  root.classList.toggle('rg-portrait', isPortraitBox(box))
}

function clearPinnedStyles(el: HTMLElement) {
  el.style.removeProperty('position')
  el.style.removeProperty('top')
  el.style.removeProperty('left')
  el.style.removeProperty('right')
  el.style.removeProperty('bottom')
  el.style.removeProperty('width')
  el.style.removeProperty('height')
  el.style.removeProperty('transform')
  el.style.removeProperty('transform-origin')
}

function pinFaux(el: HTMLElement, box: ViewportBox) {
  el.style.position = 'fixed'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.transform = 'none'
  el.style.top = `${box.top}px`
  el.style.left = `${box.left}px`
  el.style.width = `${box.width}px`
  el.style.height = `${box.height}px`
}

function pinSideways(el: HTMLElement, box: ViewportBox) {
  const frame = sidewaysFrame(box)
  el.style.position = 'fixed'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.width = frame.width
  el.style.height = frame.height
  el.style.top = frame.top
  el.style.left = frame.left
  el.style.transformOrigin = 'top left'
  el.style.transform = 'rotate(90deg) translateY(-100%)'
}

async function lockLandscape(): Promise<boolean> {
  const orientation = screen.orientation as Orientable | undefined
  if (!orientation?.lock) return false
  try {
    await orientation.lock('landscape')
    return true
  } catch {
    return false
  }
}

function unlockOrientation() {
  const orientation = screen.orientation as Orientable | undefined
  try {
    orientation?.unlock?.()
  } catch {
    // unlock throws if this page never locked orientation
  }
}

function touchInput(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches
}

/**
 * Fullscreen for the play surface.
 * Phones that cannot lock rotation (iOS) get a CSS surface turned sideways.
 * Android uses native fullscreen and landscape lock when the browser allows it.
 * The visible viewport is published as --app-vv* so the stage fits under the URL bar.
 */
export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [cssFallback, setCssFallback] = useState(false)
  const [sideways, setSideways] = useState(false)
  const [portrait, setPortrait] = useState(() =>
    typeof window !== 'undefined' ? isPortraitBox(readViewport()) : false,
  )

  useEffect(() => {
    const onChange = () => {
      const active = getFullscreenElement() === targetRef.current
      if (active) setCssFallback(false)
      setIsFullscreen(active || cssFallback)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [targetRef, cssFallback])

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const pinned = cssFallback || sideways
    const prev = pinned
      ? {
          htmlOverflow: html.style.overflow,
          bodyOverflow: body.style.overflow,
          bodyPosition: body.style.position,
          bodyWidth: body.style.width,
          bodyTop: body.style.top,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        }
      : null

    if (pinned && prev) {
      html.classList.add('rg-faux-fullscreen')
      body.classList.add('rg-faux-fullscreen')
      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      window.scrollTo(0, 0)
      body.style.position = 'fixed'
      body.style.width = '100%'
      body.style.top = '0px'
    }

    const sync = () => {
      const box = readViewport()
      publishViewport(box)
      const nextPortrait = isPortraitBox(box)
      setPortrait((prev) => (prev === nextPortrait ? prev : nextPortrait))
      const el = targetRef.current
      if (!el) return
      if (sideways) pinSideways(el, box)
      else if (cssFallback) pinFaux(el, box)
      else if (!getFullscreenElement()) clearPinnedStyles(el)
      if (sideways && !isPortraitBox(box)) setSideways(false)
    }
    sync()
    requestAnimationFrame(() => requestAnimationFrame(sync))

    const vv = window.visualViewport
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (cssFallback || sideways)) {
        setCssFallback(false)
        setSideways(false)
        setIsFullscreen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
      document.removeEventListener('keydown', onKeyDown)
      if (pinned && prev) {
        html.classList.remove('rg-faux-fullscreen')
        body.classList.remove('rg-faux-fullscreen')
        html.style.overflow = prev.htmlOverflow
        body.style.overflow = prev.bodyOverflow
        body.style.position = prev.bodyPosition
        body.style.width = prev.bodyWidth
        body.style.top = prev.bodyTop
        window.scrollTo(prev.scrollX, prev.scrollY)
      }
      const el = targetRef.current
      if (el && !getFullscreenElement()) clearPinnedStyles(el)
    }
  }, [cssFallback, sideways, targetRef])

  const enter = useCallback(async () => {
    const el = targetRef.current
    if (!el || getFullscreenElement() || cssFallback) return

    const portrait = isPortraitBox(readViewport())
    const plan = fullscreenPlan({
      ua: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      portrait,
      nativeEnabled: nativeFullscreenEnabled(),
      lockAvailable: typeof (screen.orientation as Orientable | undefined)?.lock === 'function',
    })

    if (plan === 'css' || plan === 'css-sideways') {
      window.scrollTo(0, 0)
      if (plan === 'css-sideways') setSideways(true)
      setCssFallback(true)
      setIsFullscreen(true)
      return
    }

    try {
      await requestNativeFullscreen(el)
      if (plan === 'native-lock') {
        const locked = await lockLandscape()
        if (!locked && portrait && touchInput()) setSideways(true)
      }
    } catch (err) {
      console.warn('Native fullscreen failed; using the on-screen play surface', err)
      window.scrollTo(0, 0)
      if (portrait && touchInput()) setSideways(true)
      setCssFallback(true)
      setIsFullscreen(true)
    }
  }, [targetRef, cssFallback])

  const exit = useCallback(async () => {
    unlockOrientation()
    setSideways(false)
    if (getFullscreenElement()) {
      try {
        await exitNativeFullscreen()
      } catch (err) {
        console.error('Exit fullscreen failed', err)
      }
    }
    setCssFallback(false)
    setIsFullscreen(false)
  }, [])

  const toggle = useCallback(async () => {
    if (getFullscreenElement() || cssFallback || sideways) await exit()
    else await enter()
  }, [enter, exit, cssFallback, sideways])

  const toggleSideways = useCallback(() => {
    setSideways((on) => !on)
  }, [])

  return { isFullscreen, cssFallback, sideways, portrait, enter, exit, toggle, toggleSideways }
}
