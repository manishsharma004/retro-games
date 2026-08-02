import { useEffect, useRef } from 'react'
import type { useCoopSession } from './useCoopSession'
import type { UseEmulatorResult } from '../useEmulator'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { SessionMode } from '../../lib/peer/protocol'
import type { ModeHookBase } from './types'

export interface UseHostGameSyncOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  coop: Pick<ReturnType<typeof useCoopSession>, 'shareGame'>
  isHost: boolean
  sessionMode: SessionMode
}

function gameKey(emu: UseEmulatorResult): string | null {
  const game = emu.game
  if (!game) return null
  if (emu.status === 'idle' || emu.status === 'loading') return null
  const fileId = game.libraryFile ?? game.file?.name ?? game.source
  return `${game.system}:${game.name}:${fileId}`
}

/** When the host loads a new ROM, push it to every connected peer automatically. */
export function useHostGameSync({
  enabled,
  peer,
  emu,
  coop,
  isHost,
  sessionMode,
}: UseHostGameSyncOptions) {
  const lastKeyRef = useRef<string | null>(null)
  const sharingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !isHost) return
    if (peer.connectionState !== 'connected') {
      lastKeyRef.current = null
      return
    }

    const key = gameKey(emu)
    if (!key) return
    if (lastKeyRef.current === key) return

    const hadPrevious = lastKeyRef.current !== null
    lastKeyRef.current = key

    if (sharingRef.current) return
    sharingRef.current = true

    void (async () => {
      try {
        if (sessionMode === 'coop') {
          await coop.shareGame()
          return
        }

        const game = emu.game
        if (!game) return
        peer.sendGameUpdate({
          name: game.name,
          system: game.system,
          core: game.core,
          libraryFile: game.libraryFile,
        })
        if (hadPrevious && sessionMode === 'remote') {
          peer.refreshMediaStream()
        }
      } catch {
        // allow retry on next status tick
        lastKeyRef.current = null
      } finally {
        sharingRef.current = false
      }
    })()
  }, [
    enabled,
    isHost,
    emu.game,
    emu.status,
    peer.connectionState,
    peer.sendGameUpdate,
    peer.refreshMediaStream,
    sessionMode,
    coop.shareGame,
  ])
}
