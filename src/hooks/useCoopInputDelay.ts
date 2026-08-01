import { useEffect, useRef } from 'react'
import type { PeerSeat } from '../lib/peer'

interface CoopInputHandlers {
  pressDown: (button: string, player: number) => void
  pressUp: (button: string, player: number) => void
}

interface UseCoopInputDelayOptions {
  enabled: boolean
  delayMs: number
  localSeat: PeerSeat | null
  handlers: CoopInputHandlers
}

/**
 * Buffer remote co-op inputs so they land closer to the sender's frame,
 * reducing drift between independent emulators.
 */
export function useCoopInputDelay({
  enabled,
  delayMs,
  localSeat,
  handlers,
}: UseCoopInputDelayOptions) {
  const timersRef = useRef(new Map<string, number>())
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    return () => {
      for (const id of timersRef.current.values()) {
        window.clearTimeout(id)
      }
      timersRef.current.clear()
    }
  }, [])

  const applyRemoteInput = (seat: PeerSeat, button: string, down: boolean) => {
    if (!enabled || localSeat === null || seat === localSeat) return

    const key = `${seat}:${button}:${down ? 'd' : 'u'}`
    const existing = timersRef.current.get(key)
    if (existing !== undefined) {
      window.clearTimeout(existing)
      timersRef.current.delete(key)
    }

    const id = window.setTimeout(() => {
      timersRef.current.delete(key)
      if (down) handlersRef.current.pressDown(button, seat)
      else handlersRef.current.pressUp(button, seat)
    }, delayMs)

    timersRef.current.set(key, id)
  }

  return { applyRemoteInput }
}
