import { useCallback } from 'react'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'
import { romUrl } from '../../lib/library'
import type { ModeHookBase } from './types'

export interface UseCoopSessionOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  isHost: boolean
}

/**
 * Dual-emulator co-op: host shares ROM + initial save state once at setup.
 * After both peers load and Go, only controller inputs are synced (no ongoing state resync).
 */
export function useCoopSession({ peer, emu, isHost }: UseCoopSessionOptions) {
  const shareGame = useCallback(async () => {
    if (!isHost || !emu.game) throw new Error('Host must have a game loaded')
    emu.pause()
    let rom = await emu.getRomBytes()
    if (!rom && emu.game.source === 'demo') {
      const res = await fetch(romUrl('flappybird.nes'))
      if (!res.ok) throw new Error('Could not fetch demo ROM for peer share')
      rom = new Uint8Array(await res.arrayBuffer())
    }
    if (!rom) throw new Error('ROM bytes unavailable')
    const stateBlob = await emu.exportStateBlob()
    if (!stateBlob) throw new Error('Could not capture save state')
    const state = new Uint8Array(await stateBlob.arrayBuffer())
    await peer.sendBootstrap({
      name: emu.game.name,
      system: emu.game.system,
      core: emu.game.core,
      rom,
      state,
      libraryFile: emu.game.libraryFile,
    })
  }, [isHost, emu, peer])

  return { shareGame }
}
