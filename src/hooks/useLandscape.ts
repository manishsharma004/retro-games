import { useEffect, useState } from 'react'

/** True when the viewport is wider than tall (phones/tablets in landscape). */
export function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(orientation: landscape)').matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = () => setLandscape(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return landscape
}
