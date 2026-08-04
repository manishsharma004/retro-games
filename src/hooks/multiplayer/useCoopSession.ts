import { useCallback, useEffect, useRef, useState } from 'react'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'
import { compressStateBlob, COOP_RESYNC_RESUME_DELAY_MS, decompressStateBlob } from '../../lib/peer'
import { buildCoopProfile, profileHash, type EmulatorSettings } from '../../lib/settings'
import { romUrl } from '../../lib/library'
import type { ModeHookBase } from './types'

export interface LockstepSessionBridge {
  stopStepper: () => void
  startStepper: (at?: number) => void
  handleCoordinatedPause: () => void
}

export interface UseCoopSessionOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  isHost: boolean
  settings: EmulatorSettings
  lockstepRef: React.MutableRefObject<LockstepSessionBridge | null>
  lastProfileHashRef: React.MutableRefObject<string | null>
}

/**
 * Dual-emulator co-op: host shares ROM + initial save state once at setup.
 * During play, frame lockstep keeps both emulators in sync; save-state resync
 * corrects rare hash mismatches or reconnects.
 */
export function useCoopSession({
  enabled,
  peer,
  emu,
  isHost,
  settings,
  lockstepRef,
  lastProfileHashRef,
}: UseCoopSessionOptions) {
  const [syncPending, setSyncPending] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [, setSyncTick] = useState(0)
  const wasSteppingRef = useRef(false)
  const resyncActiveRef = useRef(false)
  const lastStateSyncAtRef = useRef(Date.now())
  const autoSyncBusyRef = useRef(false)

  useEffect(() => {
    if (!syncPending) return
    const timer = window.setTimeout(() => setSyncPending(false), 90_000)
    return () => window.clearTimeout(timer)
  }, [syncPending])

  useEffect(() => {
    if (!enabled || peer.phase !== 'playing') return
    if (peer.latencyProfile.coopSyncIntervalMs === null) return
    const id = window.setInterval(() => setSyncTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [enabled, peer.phase, peer.latencyProfile.coopSyncIntervalMs])

  const pauseForResync = useCallback(() => {
    if (!enabled) return
    if (!resyncActiveRef.current) {
      wasSteppingRef.current = emu.isLockstepActive()
      resyncActiveRef.current = true
    }
    emu.releaseAllInputs()
    lockstepRef.current?.stopStepper()
    if (emu.isRunning() && !emu.isLockstepActive()) {
      emu.pause()
    }
  }, [enabled, emu, lockstepRef])

  const resumeAfterResync = useCallback(
    (resumeAt?: number) => {
      if (!enabled) return

      const shouldResume =
        wasSteppingRef.current || (resyncActiveRef.current && peer.phase === 'playing')

      const run = () => {
        if (shouldResume && peer.phase === 'playing') {
          lockstepRef.current?.startStepper(resumeAt)
        } else if (shouldResume) {
          emu.resumeAfterStateLoad()
        }
        wasSteppingRef.current = false
        resyncActiveRef.current = false
        setSyncPending(false)
        setImporting(false)
      }

      if (!resumeAt) {
        run()
        return
      }
      const delay = resumeAt - Date.now()
      if (delay <= 0) run()
      else window.setTimeout(run, delay)
    },
    [enabled, emu, lockstepRef, peer.phase],
  )

  const finishResync = useCallback(
    (resumeAt?: number) => {
      const at = resumeAt ?? Date.now() + COOP_RESYNC_RESUME_DELAY_MS
      peer.sendResyncDone(at)
      resumeAfterResync(at)
    },
    [peer, resumeAfterResync],
  )

  const abortResync = useCallback(() => {
    finishResync()
  }, [finishResync])

  const shareGame = useCallback(async () => {
    if (!enabled || !isHost || !emu.game) throw new Error('Host must have a game loaded')
    await emu.applyCoopTiming()
    lockstepRef.current?.stopStepper()
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
    const profile = buildCoopProfile(settings)
    lastProfileHashRef.current = profileHash(profile)
    await peer.sendBootstrap({
      name: emu.game.name,
      system: emu.game.system,
      core: emu.game.core,
      rom,
      state,
      libraryFile: emu.game.libraryFile,
    })
    lastStateSyncAtRef.current = Date.now()
  }, [enabled, isHost, emu, peer, settings, lockstepRef, lastProfileHashRef])

  const pushGameState = useCallback(async () => {
    if (!enabled || !isHost || !emu.game) throw new Error('Host must have a game loaded')
    if (pushing) return
    setPushing(true)
    const conn = peer.getConnection()
    try {
      pauseForResync()
      const profile = buildCoopProfile(settings)
      peer.sendSettingsSync(profile)
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
      lastStateSyncAtRef.current = Date.now()
    } catch (err) {
      abortResync()
      throw err
    } finally {
      setPushing(false)
    }
  }, [enabled, isHost, emu, peer, settings, pushing, pauseForResync, abortResync])

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

  const handleResyncDone = useCallback(
    (resumeAt?: number) => {
      resumeAfterResync(resumeAt)
    },
    [resumeAfterResync],
  )

  const handleResyncState = useCallback(
    async (data: Uint8Array, compressed = false) => {
      if (!enabled) return
      pauseForResync()
      setImporting(true)
      try {
        const raw = decompressStateBlob(data, compressed)
        const blob = new Blob([
          raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
        ])
        await emu.importStateBlob(blob, { keepPaused: true })
        finishResync()
        lastStateSyncAtRef.current = Date.now()
      } catch (err) {
        console.error(err)
        abortResync()
        throw err
      }
    },
    [enabled, emu, pauseForResync, finishResync, abortResync],
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

  useEffect(() => {
    if (!enabled || !isHost || peer.phase !== 'playing') return
    const intervalMs = peer.latencyProfile.coopAutoSyncIntervalMs
    if (!intervalMs) return

    const id = window.setInterval(() => {
      if (autoSyncBusyRef.current || pushing || importing || syncPending) return
      autoSyncBusyRef.current = true
      void pushGameState()
        .catch(() => {})
        .finally(() => {
          autoSyncBusyRef.current = false
        })
    }, intervalMs)

    return () => window.clearInterval(id)
  }, [
    enabled,
    isHost,
    peer.phase,
    peer.latencyProfile.coopAutoSyncIntervalMs,
    pushing,
    importing,
    syncPending,
    pushGameState,
  ])

  const stateSyncBusy = pushing || syncPending || importing

  const suggestStateSync =
    enabled &&
    peer.phase === 'playing' &&
    peer.latencyProfile.coopSyncIntervalMs !== null &&
    Date.now() - lastStateSyncAtRef.current > peer.latencyProfile.coopSyncIntervalMs

  return {
    shareGame,
    syncGameState,
    handleResyncRequest,
    handleResyncStart,
    handleResyncDone,
    handleResyncState,
    syncPending,
    stateSyncBusy,
    suggestStateSync,
  }
}
