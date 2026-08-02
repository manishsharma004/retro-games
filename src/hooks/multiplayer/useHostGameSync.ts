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

function hostSessionReady(peer: UsePeerSessionResult): boolean {
  if (peer.connectionState === 'connected') return true
  return peer.role === 'host' && peer.multiGuest && peer.phase !== 'idle' && peer.phase !== 'error'
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
  const lastSyncedKeyRef = useRef<string | null>(null)
  const sharingRef = useRef(false)
  const pendingKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !isHost) return
    if (!hostSessionReady(peer)) {
      lastSyncedKeyRef.current = null
      return
    }

    const key = gameKey(emu)
    if (!key) return
    if (lastSyncedKeyRef.current === key) return

    if (sharingRef.current) {
      pendingKeyRef.current = key
      return
    }

    sharingRef.current = true

    void (async () => {
      let nextKey: string | null = key
      try {
        while (nextKey) {
          const currentKey = nextKey
          nextKey = null
          pendingKeyRef.current = null

          if (sessionMode === 'coop') {
            await coop.shareGame()
          } else {
            const game = emu.game
            if (!game) break
            peer.sendGameUpdate({
              name: game.name,
              system: game.system,
              core: game.core,
              libraryFile: game.libraryFile,
            })
            if (sessionMode === 'remote' || peer.multiGuest) {
              peer.refreshMediaStream()
            }
          }

          lastSyncedKeyRef.current = currentKey

          const pending = pendingKeyRef.current
          if (pending && pending !== lastSyncedKeyRef.current) {
            nextKey = pending
            pendingKeyRef.current = null
          }
        }
      } catch {
        lastSyncedKeyRef.current = null
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
    peer.phase,
    peer.multiGuest,
    peer.role,
    peer.sendGameUpdate,
    peer.refreshMediaStream,
    sessionMode,
    coop.shareGame,
  ])
}
