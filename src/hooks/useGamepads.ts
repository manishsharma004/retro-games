import { useEffect, useState } from 'react'

export interface ConnectedGamepad {
  index: number
  id: string
}

function readPads(): ConnectedGamepad[] {
  const list = navigator.getGamepads?.() ?? []
  const connected: ConnectedGamepad[] = []
  for (const pad of list) {
    if (pad) {
      connected.push({ index: pad.index, id: pad.id })
    }
  }
  return connected
}

function samePads(a: ConnectedGamepad[], b: ConnectedGamepad[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].index !== b[i].index || a[i].id !== b[i].id) return false
  }
  return true
}

/**
 * Track connected gamepads without forcing App re-renders on a timer.
 * Chrome only exposes pads after a gesture, so we still poll slowly, but
 * only call setState when the connected set actually changes.
 */
export function useGamepads(): ConnectedGamepad[] {
  const [pads, setPads] = useState<ConnectedGamepad[]>([])

  useEffect(() => {
    const sync = () => {
      const next = readPads()
      setPads((prev) => (samePads(prev, next) ? prev : next))
    }

    sync()
    window.addEventListener('gamepadconnected', sync)
    window.addEventListener('gamepaddisconnected', sync)
    // Slow fallback poll: some browsers omit connect events until first input.
    const interval = window.setInterval(sync, 5000)

    return () => {
      window.removeEventListener('gamepadconnected', sync)
      window.removeEventListener('gamepaddisconnected', sync)
      window.clearInterval(interval)
    }
  }, [])

  return pads
}
