import { useEffect, useState } from 'react'

export interface ConnectedGamepad {
  index: number
  id: string
  mapping: string
  buttons: number
  axes: number
}

function readPads(): ConnectedGamepad[] {
  const list = navigator.getGamepads?.() ?? []
  const connected: ConnectedGamepad[] = []
  for (const pad of list) {
    if (!pad) continue
    connected.push({
      index: pad.index,
      id: pad.id || `Controller ${pad.index}`,
      mapping: pad.mapping || '',
      buttons: pad.buttons.length,
      axes: pad.axes.length,
    })
  }
  return connected
}

function samePads(a: ConnectedGamepad[], b: ConnectedGamepad[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].index !== b[i].index ||
      a[i].id !== b[i].id ||
      a[i].buttons !== b[i].buttons
    ) {
      return false
    }
  }
  return true
}

/**
 * Track connected gamepads. Chrome only exposes pads after a user gesture;
 * we listen for connect events, gesture wakeups, and a modest poll.
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
    // Wake Gamepad API after first interaction (required in Chromium).
    window.addEventListener('pointerdown', sync, { passive: true })
    window.addEventListener('keydown', sync)
    const interval = window.setInterval(sync, 1000)

    return () => {
      window.removeEventListener('gamepadconnected', sync)
      window.removeEventListener('gamepaddisconnected', sync)
      window.removeEventListener('pointerdown', sync)
      window.removeEventListener('keydown', sync)
      window.clearInterval(interval)
    }
  }, [])

  return pads
}
