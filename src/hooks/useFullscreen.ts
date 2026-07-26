import { useCallback, useEffect, useState, type RefObject } from 'react'

export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === targetRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [targetRef])

  const enter = useCallback(async () => {
    const el = targetRef.current
    if (!el || document.fullscreenElement) return
    try {
      await el.requestFullscreen()
    } catch (err) {
      console.error('Fullscreen failed', err)
    }
  }, [targetRef])

  const exit = useCallback(async () => {
    if (!document.fullscreenElement) return
    try {
      await document.exitFullscreen()
    } catch (err) {
      console.error('Exit fullscreen failed', err)
    }
  }, [])

  const toggle = useCallback(async () => {
    if (document.fullscreenElement) {
      await exit()
    } else {
      await enter()
    }
  }, [enter, exit])

  return { isFullscreen, enter, exit, toggle }
}
