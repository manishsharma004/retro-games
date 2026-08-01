import { useCallback } from 'react'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'
import type { ModeHookBase } from './types'

export interface UseLocalHostOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  isHost: boolean
  hostOnScreenP2: boolean
}

/** Host-side local (Jackbox) mode: multiplex remote input, optional on-screen P2 pad. */
export function useLocalHost({ enabled, isHost }: UseLocalHostOptions) {
  const handleRemoteInput = useCallback(() => {
    if (!enabled || !isHost) return
  }, [enabled, isHost])

  return {
    handleRemoteInput,
    showHostP2Pad: enabled && isHost,
  }
}
