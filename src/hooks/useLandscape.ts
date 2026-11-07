import { useEffect, useState } from 'react'

type OrientWindow = Window & { orientation?: number }

function readLandscape(): boolean {
  const angle = (window as OrientWindow).orientation
  if (typeof angle === 'number' && Number.isFinite(angle)) {
    const normalized = ((angle % 360) + 360) % 360
    return normalized === 90 || normalized === 270
  }
  return window.matchMedia('(orientation: landscape)').matches
}

/** True when the phone is landscape. `window.orientation` updates before innerWidth on iOS. */
export function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window !== 'undefined' ? readLandscape() : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = () => setLandscape(readLandscape())
    onChange()
    mq.addEventListener('change', onChange)
    window.addEventListener('orientationchange', onChange)
    window.addEventListener('resize', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('orientationchange', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  return landscape
}
