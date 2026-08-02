import { useEffect } from 'react'
import type { UseEmulatorResult } from '../useEmulator'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { ModeHookBase } from './types'

export interface UseCoopAutoStartOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  isHost: boolean
}

/** After a ROM bootstrap, auto ready/go so co-op guests follow host game changes without lobby clicks. */
export function useCoopAutoStart({ enabled, peer, emu, isHost }: UseCoopAutoStartOptions) {
  useEffect(() => {
    if (!enabled || peer.phase !== 'ready-wait') return
    if (emu.status === 'loading' || emu.status === 'idle') return

    if (!isHost && peer.role === 'guest') {
      peer.sendReady()
      return
    }

    if (isHost && peer.remoteReady) {
      peer.sendReady()
      peer.sendGo()
    }
  }, [
    enabled,
    isHost,
    peer.phase,
    peer.role,
    peer.remoteReady,
    emu.status,
    peer.sendReady,
    peer.sendGo,
  ])
}
