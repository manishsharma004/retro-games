import { useCallback, useEffect, useRef, useState } from 'react'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'
import { compressStateBlob, decompressStateBlob } from '../../lib/peer'
import { romUrl } from '../../lib/library'
import type { ModeHookBase } from './types'

export interface UseCoopSessionOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  isHost: boolean
}

/**
 * Dual-emulator co-op: host shares ROM + initial save state once at setup.
 * After both peers load and Go, only controller inputs are synced. Use syncGameState
 * to manually align emulators when they drift (on-demand state transfer).
 */
export function useCoopSession({ enabled, peer, emu, isHost }: UseCoopSessionOptions) {
  const [syncPending, setSyncPending] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [importing, setImporting] = useState(false)
  const wasRunningBeforeResyncRef = useRef(false)

  useEffect(() => {
    if (!syncPending) return
    const timer = window.setTimeout(() => setSyncPending(false), 90_000)
    return () => window.clearTimeout(timer)
  }, [syncPending])

  const pauseForResync = useCallback(() => {
    if (!enabled) return
    wasRunningBeforeResyncRef.current = emu.isRunning()
    emu.releaseAllInputs()
    if (wasRunningBeforeResyncRef.current) {
      emu.pause()
    }
  }, [enabled, emu])

  const resumeAfterResync = useCallback(() => {
    if (!enabled) return
    if (wasRunningBeforeResyncRef.current && peer.phase === 'playing') {
      emu.resume()
    }
    wasRunningBeforeResyncRef.current = false
    setSyncPending(false)
    setImporting(false)
  }, [enabled, emu, peer.phase])

  const abortResync = useCallback(() => {
    peer.sendResyncDone()
    resumeAfterResync()
  }, [peer, resumeAfterResync])

  const shareGame = useCallback(async () => {
    if (!enabled || !isHost || !emu.game) throw new Error('Host must have a game loaded')
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
  }, [enabled, isHost, emu, peer])

  const pushGameState = useCallback(async () => {
    if (!enabled || !isHost || !emu.game) throw new Error('Host must have a game loaded')
    if (pushing) return
    setPushing(true)
    const conn = peer.getConnection()
    try {
      pauseForResync()
      try {
        conn?.sendControl({ type: 'resync-start' })
      } catch {
        // ignore
      }

      const blob = await emu.exportStateBlob({ keepPaused: true })
      if (!blob) throw new Error('Could not capture save state')
      const raw = new Uint8Array(await blob.arrayBuffer())
      const { payload, compressed } = compressStateBlob(raw)
      await peer.sendResyncState(payload, compressed)
    } catch (err) {
      abortResync()
      throw err
    } finally {
      setPushing(false)
    }
  }, [enabled, isHost, emu, peer, pushing, pauseForResync, abortResync])

  const handleResyncRequest = useCallback(async () => {
    if (!enabled || !isHost) return
    try {
      await pushGameState()
    } catch (err) {
      console.error(err)
    }
  }, [enabled, isHost, pushGameState])

  const handleResyncStart = useCallback(() => {
    pauseForResync()
  }, [pauseForResync])

  const handleResyncDone = useCallback(() => {
    resumeAfterResync()
  }, [resumeAfterResync])

  const handleResyncState = useCallback(
    async (data: Uint8Array, compressed = false) => {
      if (!enabled) return
      setImporting(true)
      try {
        const raw = decompressStateBlob(data, compressed)
        const blob = new Blob([
          raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
        ])
        await emu.importStateBlob(blob, { keepPaused: true })
        peer.sendResyncDone()
        resumeAfterResync()
      } catch (err) {
        console.error(err)
        abortResync()
        throw err
      }
    },
    [enabled, emu, peer, resumeAfterResync, abortResync],
  )

  const syncGameState = useCallback(async () => {
    if (!enabled) return
    if (isHost) {
      await pushGameState()
    } else {
      setSyncPending(true)
      peer.requestResync()
    }
  }, [enabled, isHost, peer, pushGameState])

  const stateSyncBusy = pushing || syncPending || importing

  return {
    shareGame,
    syncGameState,
    handleResyncRequest,
    handleResyncStart,
    handleResyncDone,
    handleResyncState,
    syncPending,
    stateSyncBusy,
  }
}
