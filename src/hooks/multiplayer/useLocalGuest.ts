import { useCallback, useEffect, useRef } from 'react'
import type { PeerSeat } from '../../lib/peer/protocol'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { ModeHookBase } from './types'

export interface UseLocalGuestOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  seat?: PeerSeat
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported
  }
}

/** Guest local mode: virtual pad only, no emulator. */
export function useLocalGuest({ enabled, peer }: UseLocalGuestOptions) {
  const seat = peer.seat ?? 2
  const pressedRef = useRef(new Set<string>())

  const releaseAll = useCallback(() => {
    for (const button of pressedRef.current) {
      peer.sendInput(button, false)
    }
    pressedRef.current.clear()
  }, [peer])

  useEffect(() => {
    if (peer.seat === null) releaseAll()
  }, [peer.seat, releaseAll])

  const onPress = useCallback(
    (button: string) => {
      if (!enabled || peer.seat === null) return
      vibrate(30)
      pressedRef.current.add(button)
      peer.sendInput(button, true)
    },
    [enabled, peer],
  )

  const onRelease = useCallback(
    (button: string) => {
      if (!enabled || peer.seat === null) return
      pressedRef.current.delete(button)
      peer.sendInput(button, false)
    },
    [enabled, peer],
  )

  return {
    onPress,
    onRelease,
    releaseAll,
    seat,
    connected: peer.connectionState === 'connected',
    phase: peer.phase,
  }
}
