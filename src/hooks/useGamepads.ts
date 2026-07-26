import { useEffect, useState } from 'react'

export interface ConnectedGamepad {
  index: number
  id: string
}

export function useGamepads(): ConnectedGamepad[] {
  const [pads, setPads] = useState<ConnectedGamepad[]>([])

  useEffect(() => {
    const sync = () => {
      const list = navigator.getGamepads?.() ?? []
      const connected: ConnectedGamepad[] = []
      for (const pad of list) {
        if (pad) {
          connected.push({ index: pad.index, id: pad.id })
        }
      }
      setPads(connected)
    }

    sync()
    window.addEventListener('gamepadconnected', sync)
    window.addEventListener('gamepaddisconnected', sync)
    const interval = window.setInterval(sync, 1500)

    return () => {
      window.removeEventListener('gamepadconnected', sync)
      window.removeEventListener('gamepaddisconnected', sync)
      window.clearInterval(interval)
    }
  }, [])

  return pads
}
