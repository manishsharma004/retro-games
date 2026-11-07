import {
  alignViewportToOrientation,
  fullscreenPlan,
  isPortraitBox,
  physicalPortrait,
  saneViewport,
  sidewaysPlacement,
} from './mobilePlay'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

const iphone = {
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  touchPoints: 5,
  coarsePointer: true,
  nativeEnabled: false,
  lockAvailable: false,
}

assert(
  fullscreenPlan({ ...iphone, portrait: true }) === 'css-sideways',
  'portrait iPhone fullscreen is a rotated CSS surface',
)
assert(
  fullscreenPlan({ ...iphone, portrait: false }) === 'css',
  'landscape iPhone fullscreen stays upright CSS',
)
assert(
  fullscreenPlan({
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
    touchPoints: 5,
    coarsePointer: true,
    portrait: true,
    nativeEnabled: true,
    lockAvailable: true,
  }) === 'native-lock',
  'Android portrait fullscreen locks landscape',
)
assert(
  fullscreenPlan({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    touchPoints: 5,
    coarsePointer: true,
    portrait: true,
    nativeEnabled: true,
    lockAvailable: false,
  }) === 'css-sideways',
  'iPadOS Macintosh UA is treated as iOS',
)
assert(isPortraitBox({ width: 390, height: 844 }), 'tall phone is portrait')
assert(!isPortraitBox({ width: 844, height: 390 }), 'wide phone is landscape')

/** CSS rotate(90deg) around the sheet center, y down. */
function coverPoint(
  place: ReturnType<typeof sidewaysPlacement>,
  x: number,
  y: number,
): { x: number; y: number } {
  const cx = place.left + place.width / 2
  const cy = place.top + place.height / 2
  const dx = x - place.width / 2
  const dy = y - place.height / 2
  return { x: cx - dy, y: cy + dx }
}

function assertCovers(width: number, height: number, label: string) {
  const place = sidewaysPlacement({ width, height, top: 0, left: 0 })
  assert(place.transform === 'rotate(90deg)', `${label} uses a center rotation`)
  assert(place.clipWidth === width && place.clipHeight === height, `${label} clip matches the screen`)
  const corners = [
    coverPoint(place, 0, 0),
    coverPoint(place, place.width, 0),
    coverPoint(place, 0, place.height),
    coverPoint(place, place.width, place.height),
  ]
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  assert(Math.abs(minX) < 0.01 && Math.abs(minY) < 0.01, `${label} starts at the clip origin`)
  assert(Math.abs(maxX - width) < 0.01 && Math.abs(maxY - height) < 0.01, `${label} fills the clip`)
}

assertCovers(390, 844, 'portrait phone')
assertCovers(390, 700, 'portrait phone under Chrome toolbars')
assertCovers(844, 390, 'landscape phone')

const stalePortrait = { width: 390, height: 844, top: 0, left: 156 }
const aligned = alignViewportToOrientation(stalePortrait, false)
assert(aligned.width === 844 && aligned.height === 390, 'landscape rotation swaps a stale portrait box')
assert(aligned.left === 0 && aligned.top === 0, 'stale rotation drops the left gap')
const kept = alignViewportToOrientation({ width: 844, height: 390, top: 0, left: 0 }, false)
assert(kept.width === 844 && kept.height === 390, 'a fresh landscape box is kept')
const back = alignViewportToOrientation({ width: 844, height: 390, top: 12, left: 80 }, true)
assert(back.width === 390 && back.height === 844 && back.left === 0, 'portrait rotation swaps a stale landscape box')
assert(physicalPortrait(90) === false, 'orientation angle 90 is landscape')
assert(physicalPortrait(0) === true, 'orientation angle 0 is portrait')
assert(physicalPortrait(null) === null, 'a missing angle does not resize the window')

const shifted = saneViewport({ width: 390, height: 700, top: 59, left: 156 }, 1)
assert(shifted.left === 0 && shifted.top === 59, 'scale-1 drops a wide left offset and keeps a toolbar inset')
const zoomed = saneViewport({ width: 320, height: 640, top: 40, left: 80 }, 1.2)
assert(zoomed.left === 80 && zoomed.top === 40, 'pinch-zoom keeps the visual viewport offset')

console.log('mobile play checks ok')
