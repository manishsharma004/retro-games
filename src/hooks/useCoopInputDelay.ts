import { useCallback, useEffect, useRef } from 'react'
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
  sendInput: (button: string, down: boolean, executeAt: number) => void
}

/**
 * Symmetric co-op input sync: local presses are delayed before applying locally
 * and sent with a shared execute timestamp; remote inputs are scheduled to that
 * same time so both emulators apply inputs on aligned frames.
 */
export function useCoopInputDelay({
  enabled,
  delayMs,
  localSeat,
  handlers,
  sendInput,
}: UseCoopInputDelayOptions) {
  const timersRef = useRef(new Map<string, number>())
  const handlersRef = useRef(handlers)
  const sendInputRef = useRef(sendInput)
  const delayMsRef = useRef(delayMs)
  handlersRef.current = handlers
  sendInputRef.current = sendInput
  delayMsRef.current = delayMs

  useEffect(() => {
    return () => {
      for (const id of timersRef.current.values()) {
        window.clearTimeout(id)
      }
      timersRef.current.clear()
    }
  }, [])

  const scheduleInput = useCallback((key: string, executeAt: number, apply: () => void) => {
    const existing = timersRef.current.get(key)
    if (existing !== undefined) {
      window.clearTimeout(existing)
      timersRef.current.delete(key)
    }

    const delay = Math.max(0, executeAt - Date.now())
    const id = window.setTimeout(() => {
      timersRef.current.delete(key)
      apply()
    }, delay)
    timersRef.current.set(key, id)
  }, [])

  const queueLocalInput = useCallback(
    (button: string, down: boolean) => {
      if (!enabled || localSeat === null) return

      const executeAt = Date.now() + delayMsRef.current
      const key = `local:${button}:${down ? 'd' : 'u'}`
      scheduleInput(key, executeAt, () => {
        if (down) handlersRef.current.pressDown(button, localSeat)
        else handlersRef.current.pressUp(button, localSeat)
      })
      sendInputRef.current(button, down, executeAt)
    },
    [enabled, localSeat, scheduleInput],
  )

  const applyRemoteInput = useCallback(
    (seat: PeerSeat, button: string, down: boolean, executeAt?: number) => {
      if (!enabled || localSeat === null || seat === localSeat) return

      const at = executeAt ?? Date.now() + delayMsRef.current
      const key = `remote:${seat}:${button}:${down ? 'd' : 'u'}`
      scheduleInput(key, at, () => {
        if (down) handlersRef.current.pressDown(button, seat)
        else handlersRef.current.pressUp(button, seat)
      })
    },
    [enabled, localSeat, scheduleInput],
  )

  return { queueLocalInput, applyRemoteInput }
}
