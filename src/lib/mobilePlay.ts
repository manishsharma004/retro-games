/** iPhone, iPod, iPad, and iPadOS (which reports itself as a Mac with touch). */
export function isIosUa(ua: string, touchPoints = 0): boolean {
  if (/iPhone|iPod|iPad/.test(ua)) return true
  return /Macintosh/.test(ua) && touchPoints > 1
}

export function isAndroidUa(ua: string): boolean {
  return /Android/i.test(ua)
}

export type FullscreenPlan = 'native' | 'native-lock' | 'css' | 'css-sideways'

/**
 * How fullscreen should behave.
 * iOS cannot fullscreen a div or lock orientation, so a portrait phone is
 * rotated in CSS. Android uses the Fullscreen API and locks landscape when it can.
 */
export function fullscreenPlan(input: {
  ua: string
  touchPoints: number
  coarsePointer: boolean
  portrait: boolean
  nativeEnabled: boolean
  lockAvailable: boolean
}): FullscreenPlan {
  const touch = input.touchPoints > 0 || input.coarsePointer
  const ios = isIosUa(input.ua, input.touchPoints)
  if (ios || !input.nativeEnabled) {
    return input.portrait && touch ? 'css-sideways' : 'css'
  }
  if (input.portrait && touch && input.lockAvailable) return 'native-lock'
  return 'native'
}

export interface ViewportBox {
  width: number
  height: number
  top: number
  left: number
}

export function isPortraitBox(box: Pick<ViewportBox, 'width' | 'height'>): boolean {
  return box.height > box.width + 20
}

/** Fired after a rotation has been written into the layout. */
export const ORIENTATION_SETTLED = 'rg-orientation-settled'

/**
 * `window.orientation` on iOS: 0 and 180 are portrait, 90 and -90 are landscape.
 * Returns null when the browser does not report it. The screen orientation
 * type follows the monitor, so it must not resize a desktop window.
 */
export function physicalPortrait(angle: number | null): boolean | null {
  if (angle === null || !Number.isFinite(angle)) return null
  const normalized = ((angle % 360) + 360) % 360
  return normalized === 0 || normalized === 180
}

/**
 * Chrome on iOS keeps the previous orientation's viewport for a frame after
 * rotation, which leaves the player scaled with a wide left gap. Swap that
 * stale box so it matches the physical orientation. A matching box is kept.
 */
export function alignViewportToOrientation(box: ViewportBox, portrait: boolean | null): ViewportBox {
  const cleaned = saneViewport(box, 1)
  if (portrait === null || isPortraitBox(cleaned) === portrait) return cleaned
  return {
    width: cleaned.height,
    height: cleaned.width,
    top: 0,
    left: 0,
  }
}

/**
 * Drop a sideways offset that Chrome on iOS reports while the page is not
 * pinch-zoomed. A real toolbar inset is a small top offset, not a wide left gap.
 */
export function saneViewport(box: ViewportBox, scale = 1): ViewportBox {
  if (scale !== 1) return box
  const left = Math.abs(box.left) > 1 ? 0 : box.left
  const top = box.top < 0 || box.top > box.height * 0.45 ? 0 : box.top
  if (left === box.left && top === box.top) return box
  return { ...box, left, top }
}

export interface SidewaysPlacement {
  clipTop: number
  clipLeft: number
  clipWidth: number
  clipHeight: number
  top: number
  left: number
  width: number
  height: number
  transform: string
}

/**
 * Portrait play surface turned sideways.
 * The clip matches the visible viewport. The landscape sheet is centered in
 * that clip and rotated about its own center, so the result does not depend
 * on transform-origin or a percentage translate (Chrome on iOS drops both,
 * which parks the game about 40% in from the left and crops it huge).
 */
export function sidewaysPlacement(box: ViewportBox): SidewaysPlacement {
  const width = box.height
  const height = box.width
  return {
    clipTop: box.top,
    clipLeft: box.left,
    clipWidth: box.width,
    clipHeight: box.height,
    width,
    height,
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    transform: 'rotate(90deg)',
  }
}
