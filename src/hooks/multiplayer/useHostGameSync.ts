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
  const lastSyncedLaunchRef = useRef(0)
  const lastGuestCountRef = useRef(0)
  const sharingRef = useRef(false)
  const pendingKeyRef = useRef<string | null>(null)
  const emuRef = useRef(emu)
  const peerRef = useRef(peer)
  emuRef.current = emu
  peerRef.current = peer

  useEffect(() => {
    if (!enabled || !isHost) return
    if (!hostSessionReady(peer)) {
      lastSyncedKeyRef.current = null
      lastSyncedLaunchRef.current = 0
      return
    }

    const key = gameKey(emu)
    if (!key) return

    const launchChanged = emu.launchGeneration !== lastSyncedLaunchRef.current
    const guestsJoined = peer.connectedGuestCount > lastGuestCountRef.current
    const keyChanged = lastSyncedKeyRef.current !== key

    if (!keyChanged && !launchChanged && !guestsJoined) return

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

          const liveEmu = emuRef.current
          const livePeer = peerRef.current
          const game = liveEmu.game
          if (!game) break

          if (sessionMode === 'coop') {
            await coop.shareGame()
          } else {
            livePeer.syncHostGameToGuests({
              name: game.name,
              system: game.system,
              core: game.core,
              libraryFile: game.libraryFile,
            })
          }

          lastSyncedKeyRef.current = currentKey
          lastSyncedLaunchRef.current = liveEmu.launchGeneration
          lastGuestCountRef.current = livePeer.connectedGuestCount

          const pending = pendingKeyRef.current
          if (pending && pending !== lastSyncedKeyRef.current) {
            nextKey = pending
            pendingKeyRef.current = null
          }
        }
      } catch {
        lastSyncedKeyRef.current = null
        lastSyncedLaunchRef.current = 0
      } finally {
        sharingRef.current = false
      }
    })()
  }, [
    enabled,
    isHost,
    emu.game,
    emu.status,
    emu.launchGeneration,
    peer.connectionState,
    peer.phase,
    peer.multiGuest,
    peer.role,
    peer.connectedGuestCount,
    peer.syncHostGameToGuests,
    sessionMode,
    coop.shareGame,
  ])
}
