import { useCallback, useEffect, useRef } from 'react'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'
import type { EmulatorSettings } from '../../lib/settings'
import { romUrl } from '../../lib/library'
import { maybeDecompressStateBlob, compressStateBlob } from '../../lib/peer/stateCompress'
import type { ModeHookBase } from './types'

const RESYNC_STABLE_MS = 5000
const RESYNC_DRIFT_MS = 1500

export interface UseCoopSessionOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  settings: EmulatorSettings
  isHost: boolean
  onRawStateFallback?: () => void
}

/** Dual-emulator co-op: ROM bootstrap, compressed resync, pause-on-import. */
export function useCoopSession({
  enabled,
  peer,
  emu,
  isHost,
  onRawStateFallback,
}: UseCoopSessionOptions) {
  const resyncIntervalRef = useRef(RESYNC_STABLE_MS)
  const driftRef = useRef(0)

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

  const pushResync = useCallback(async () => {
    if (!isHost) return
    const blob = await emu.exportStateBlob()
    if (!blob) return
    const raw = new Uint8Array(await blob.arrayBuffer())
    const { payload, compressed } = compressStateBlob(raw)
    if (!compressed) onRawStateFallback?.()
    try {
      peer.getConnection()?.sendControl({ type: 'resync-start' })
    } catch {
      // fallback: immediate import on guest without handshake
    }
    await peer.sendResyncState(payload, compressed)
    try {
      peer.getConnection()?.sendControl({ type: 'resync-done' })
    } catch {
      // ignore
    }
  }, [isHost, emu, peer, onRawStateFallback])

  useEffect(() => {
    if (!enabled || !isHost || peer.phase !== 'playing') return
    const id = window.setInterval(() => {
      void pushResync()
    }, resyncIntervalRef.current)
    return () => window.clearInterval(id)
  }, [enabled, isHost, peer.phase, pushResync])

  const onResyncRequest = useCallback(() => {
    driftRef.current += 1
    resyncIntervalRef.current = RESYNC_DRIFT_MS
    void pushResync()
  }, [pushResync])

  const importResyncState = useCallback(
    async (data: Uint8Array, _compressed = false) => {
      const state = maybeDecompressStateBlob(data)
      await emu.importStateBlob(new Blob([new Uint8Array(state)]))
      if (driftRef.current > 0) driftRef.current -= 1
      if (driftRef.current === 0) resyncIntervalRef.current = RESYNC_STABLE_MS
    },
    [emu],
  )

  return {
    shareGame,
    pushResync,
    onResyncRequest,
    importResyncState,
    autoShareOnLinked: enabled && isHost,
  }
}
