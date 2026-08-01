import { useCallback } from 'react'
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
export function useLocalGuest({ enabled, peer, seat = 2 }: UseLocalGuestOptions) {
  const onPress = useCallback(
    (button: string) => {
      if (!enabled) return
      vibrate(30)
      peer.sendInput(button, true)
    },
    [enabled, peer],
  )

  const onRelease = useCallback(
    (button: string) => {
      if (!enabled) return
      peer.sendInput(button, false)
    },
    [enabled, peer],
  )

  return {
    onPress,
    onRelease,
    seat,
    connected: peer.connectionState === 'connected',
    phase: peer.phase,
  }
}
