import { useCallback, useEffect, useState, type RefObject } from 'react'
import {
  ORIENTATION_SETTLED,
  alignViewportToOrientation,
  fullscreenPlan,
  isIosUa,
  isPortraitBox,
  physicalPortrait,
  saneViewport,
  sidewaysPlacement,
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

type OrientWindow = Window & { orientation?: number }

function readRawViewport(): ViewportBox {
  const vv = window.visualViewport
  return saneViewport(
    {
      width: vv?.width ?? window.innerWidth,
      height: vv?.height ?? window.innerHeight,
      top: vv?.offsetTop ?? 0,
      left: vv?.offsetLeft ?? 0,
    },
    1,
  )
}

function readViewport(correcting: boolean): ViewportBox {
  const raw = readRawViewport()
  if (!correcting) return raw
  const angle = (window as OrientWindow).orientation
  const hint = physicalPortrait(typeof angle === 'number' ? angle : null)
  return alignViewportToOrientation(raw, hint)
}

/** Chrome on iOS keeps the previous scale and scroll offset across a rotation. */
function resetIosViewportScale() {
  if (!isIosUa(navigator.userAgent, navigator.maxTouchPoints)) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!(meta instanceof HTMLMetaElement)) return
  const content = meta.content || 'width=device-width, initial-scale=1, viewport-fit=cover'
  meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
  void document.documentElement.offsetWidth
  window.scrollTo(0, 0)
  requestAnimationFrame(() => {
    meta.content = content
    window.scrollTo(0, 0)
  })
}

function clearPageShift() {
  window.scrollTo(0, 0)
  document.documentElement.scrollLeft = 0
  document.body.scrollLeft = 0
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`
}

function turnEl(el: HTMLElement): HTMLElement | null {
  return el.querySelector(':scope > .player__turn')
}

function clearTurn(el: HTMLElement) {
  const turn = turnEl(el)
  if (!turn) return
  for (const prop of ['position', 'top', 'left', 'width', 'height', 'transform', 'transform-origin', '-webkit-transform', '-webkit-transform-origin']) {
    turn.style.removeProperty(prop)
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
  el.style.removeProperty('-webkit-transform')
  el.style.removeProperty('-webkit-transform-origin')
  el.style.removeProperty('overflow')
  clearTurn(el)
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
  const place = sidewaysPlacement(box)
  el.style.position = 'fixed'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.transform = 'none'
  el.style.top = px(place.clipTop)
  el.style.left = px(place.clipLeft)
  el.style.width = px(place.clipWidth)
  el.style.height = px(place.clipHeight)
  el.style.overflow = 'hidden'
  const turn = turnEl(el)
  const sheet = turn ?? el
  if (turn) {
    sheet.style.position = 'absolute'
    sheet.style.top = px(place.top)
    sheet.style.left = px(place.left)
  } else {
    sheet.style.top = px(place.clipTop + place.top)
    sheet.style.left = px(place.clipLeft + place.left)
  }
  sheet.style.width = px(place.width)
  sheet.style.height = px(place.height)
  sheet.style.transformOrigin = 'center'
  sheet.style.transform = place.transform
  sheet.style.setProperty('-webkit-transform-origin', 'center')
  sheet.style.setProperty('-webkit-transform', place.transform)
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
    typeof window !== 'undefined' ? isPortraitBox(readViewport(false)) : false,
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

    let orientingUntil = 0
    let settleTimer = 0

    const sync = (correcting = performance.now() < orientingUntil) => {
      if (correcting) clearPageShift()
      const box = readViewport(correcting)
      publishViewport(box)
      const nextPortrait = isPortraitBox(box)
      setPortrait((prev) => (prev === nextPortrait ? prev : nextPortrait))
      const el = targetRef.current
      if (!el) return
      const turnSideways = sideways && nextPortrait
      if (turnSideways) pinSideways(el, box)
      else if (cssFallback || sideways) {
        clearTurn(el)
        pinFaux(el, box)
      } else if (!getFullscreenElement()) clearPinnedStyles(el)
      if (sideways && !nextPortrait) setSideways(false)
      if (correcting && nextPortrait && cssFallback && touchInput() && !sideways) setSideways(true)
      if (correcting) window.dispatchEvent(new Event(ORIENTATION_SETTLED))
    }
    sync(false)
    requestAnimationFrame(() => requestAnimationFrame(() => sync(false)))

    const onOrientation = () => {
      orientingUntil = performance.now() + 800
      clearPageShift()
      resetIosViewportScale()
      sync(true)
      requestAnimationFrame(() => requestAnimationFrame(() => sync(true)))
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => sync(true), 320)
    }

    const onViewport = () => sync()

    const vv = window.visualViewport
    vv?.addEventListener('resize', onViewport)
    vv?.addEventListener('scroll', onViewport)
    window.addEventListener('resize', onViewport)
    window.addEventListener('orientationchange', onOrientation)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (cssFallback || sideways)) {
        setCssFallback(false)
        setSideways(false)
        setIsFullscreen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(settleTimer)
      vv?.removeEventListener('resize', onViewport)
      vv?.removeEventListener('scroll', onViewport)
      window.removeEventListener('resize', onViewport)
      window.removeEventListener('orientationchange', onOrientation)
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

    const portrait = isPortraitBox(readViewport(false))
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
