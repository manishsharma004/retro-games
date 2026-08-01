import { useEffect, useState, type RefObject } from 'react'

type VideoFrameCanvas = HTMLCanvasElement & {
  requestVideoFrameCallback?: (callback: () => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/** Measure presented canvas frames per second while the emulator is running. */
export function useEmulatorFps(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  active: boolean,
): number | null {
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    if (!active) {
      setFps(null)
      return
    }

    const canvas = canvasRef.current as VideoFrameCanvas | null
    if (!canvas) return

    let frames = 0
    let lastReport = performance.now()
    let cancelled = false
    let rvfcId = 0
    let rafId = 0

    const report = () => {
      const now = performance.now()
      const elapsed = now - lastReport
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed))
        frames = 0
        lastReport = now
      }
    }

    if (typeof canvas.requestVideoFrameCallback === 'function') {
      const onFrame = () => {
        if (cancelled) return
        frames++
        report()
        rvfcId = canvas.requestVideoFrameCallback!(onFrame)
      }
      rvfcId = canvas.requestVideoFrameCallback(onFrame)
      return () => {
        cancelled = true
        canvas.cancelVideoFrameCallback?.(rvfcId)
      }
    }

    const tick = () => {
      if (cancelled) return
      frames++
      report()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [canvasRef, active])

  return fps
}
