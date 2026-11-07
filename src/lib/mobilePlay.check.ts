import { fullscreenPlan, isPortraitBox, sidewaysFrame } from './mobilePlay'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

const iphone = {
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
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

const frame = sidewaysFrame({ width: 390, height: 844, top: 0, left: 0 })
assert(frame.width === '844px' && frame.height === '390px', 'sideways swaps the viewport edges')

console.log('mobile play checks ok')
