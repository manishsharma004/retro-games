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

/** Geometry for a play surface rotated 90° so a portrait phone plays landscape. */
export function sidewaysFrame(box: ViewportBox): {
  width: string
  height: string
  top: string
  left: string
} {
  return {
    width: `${Math.round(box.height)}px`,
    height: `${Math.round(box.width)}px`,
    top: `${Math.round(box.top)}px`,
    left: `${Math.round(box.left)}px`,
  }
}
