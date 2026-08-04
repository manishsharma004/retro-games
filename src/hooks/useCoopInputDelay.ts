import { useCallback, useEffect, useRef } from 'react'
import type { PeerSeat } from '../lib/peer'

interface CoopInputHandlers {
  pressDown: (button: string, player: number) => void
  pressUp: (button: string, player: number) => void
}

interface QueuedInput {
  down: boolean
  executeAt: number
}

interface UseCoopInputDelayOptions {
  enabled: boolean
  delayMs: number
  /** Remote clock minus local clock; null until estimated from ping/pong. */
  clockOffsetMs: number | null
  localSeat: PeerSeat | null
  handlers: CoopInputHandlers
  sendInput: (button: string, down: boolean, executeAt: number) => void
}

/**
 * Symmetric co-op input sync with ordered per-button queues.
 * Local inputs are delayed before apply + network send; remote inputs are
 * scheduled from the sender timestamp (clock-adjusted) or receipt + delay.
 */
export function useCoopInputDelay({
  enabled,
  delayMs,
  clockOffsetMs,
  localSeat,
  handlers,
  sendInput,
}: UseCoopInputDelayOptions) {
  const queuesRef = useRef(new Map<string, QueuedInput[]>())
  const timersRef = useRef(new Map<string, number>())
  const handlersRef = useRef(handlers)
  const sendInputRef = useRef(sendInput)
  const delayMsRef = useRef(delayMs)
  const clockOffsetRef = useRef(clockOffsetMs)
  handlersRef.current = handlers
  sendInputRef.current = sendInput
  delayMsRef.current = delayMs
  clockOffsetRef.current = clockOffsetMs

  const clearPending = useCallback(() => {
    for (const id of timersRef.current.values()) {
      window.clearTimeout(id)
    }
    timersRef.current.clear()
    queuesRef.current.clear()
  }, [])

  useEffect(() => {
    if (!enabled) clearPending()
  }, [enabled, clearPending])

  useEffect(() => {
    return () => clearPending()
  }, [clearPending])

  const pumpQueue = useCallback((key: string, apply: (down: boolean) => void) => {
    const existing = timersRef.current.get(key)
    if (existing !== undefined) {
      window.clearTimeout(existing)
      timersRef.current.delete(key)
    }

    const queue = queuesRef.current.get(key)
    if (!queue?.length) {
      queuesRef.current.delete(key)
      return
    }

    const next = queue[0]
    const delay = Math.max(0, next.executeAt - Date.now())
    const id = window.setTimeout(() => {
      timersRef.current.delete(key)
      queue.shift()
      if (!queue.length) queuesRef.current.delete(key)
      apply(next.down)
      pumpQueue(key, apply)
    }, delay)
    timersRef.current.set(key, id)
  }, [])

  const enqueue = useCallback(
    (key: string, down: boolean, executeAt: number, apply: (down: boolean) => void) => {
      const queue = queuesRef.current.get(key) ?? []
      queue.push({ down, executeAt })
      queue.sort((a, b) => a.executeAt - b.executeAt)
      queuesRef.current.set(key, queue)
      pumpQueue(key, apply)
    },
    [pumpQueue],
  )

  const scheduleRemoteExecuteAt = useCallback((senderAt?: number) => {
    const now = Date.now()
    const delay = delayMsRef.current
    const offset = clockOffsetRef.current
    if (senderAt !== undefined && offset !== null) {
      const localAt = senderAt - offset
      // Keep a small floor so jitter does not apply inputs in the past.
      return Math.max(now + 16, localAt)
    }
    return now + delay
  }, [])

  const queueLocalInput = useCallback(
    (button: string, down: boolean) => {
      if (!enabled || localSeat === null) return

      const executeAt = Date.now() + delayMsRef.current
      const key = `local:${button}:${localSeat}`
      enqueue(key, down, executeAt, (value) => {
        if (value) handlersRef.current.pressDown(button, localSeat)
        else handlersRef.current.pressUp(button, localSeat)
      })
      sendInputRef.current(button, down, executeAt)
    },
    [enabled, localSeat, enqueue],
  )

  const applyRemoteInput = useCallback(
    (seat: PeerSeat, button: string, down: boolean, executeAt?: number) => {
      if (!enabled || localSeat === null || seat === localSeat) return

      const at = scheduleRemoteExecuteAt(executeAt)
      const key = `remote:${seat}:${button}`
      enqueue(key, down, at, (value) => {
        if (value) handlersRef.current.pressDown(button, seat)
        else handlersRef.current.pressUp(button, seat)
      })
    },
    [enabled, localSeat, enqueue, scheduleRemoteExecuteAt],
  )

  return { queueLocalInput, applyRemoteInput, clearPending }
}
