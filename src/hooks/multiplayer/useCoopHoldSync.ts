import { useCallback, useEffect, useRef } from 'react'
import type { UseEmulatorResult } from '../useEmulator'

interface UseCoopHoldSyncOptions {
  enabled: boolean
  playing: boolean
  emu: UseEmulatorResult
  sendHold: () => void
  sendHoldRelease: (at: number) => void
}

/**
 * Pause both co-op emulators when either browser tab is hidden. Without this,
 * background-tab throttling (or RetroArch pause_nonactive) lets one core run
 * while the other stalls — the fastest source of dual-emulator drift.
 */
export function useCoopHoldSync({
  enabled,
  playing,
  emu,
  sendHold,
  sendHoldRelease,
}: UseCoopHoldSyncOptions) {
  const localHiddenRef = useRef(false)
  const remoteHoldRef = useRef(false)
  const wasRunningRef = useRef(false)
  const resumeTimerRef = useRef<number | null>(null)

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
  }, [])

  const pauseForHold = useCallback(() => {
    if (!wasRunningRef.current) {
      wasRunningRef.current = emu.isRunning()
    }
    emu.releaseAllInputs()
    if (emu.isRunning()) {
      emu.pause()
    }
  }, [emu])

  const tryResume = useCallback(
    (at?: number) => {
      if (localHiddenRef.current || remoteHoldRef.current) return
      if (!wasRunningRef.current) return

      clearResumeTimer()
      const run = () => {
        resumeTimerRef.current = null
        if (localHiddenRef.current || remoteHoldRef.current) return
        emu.resumeAfterStateLoad()
        wasRunningRef.current = false
      }

      if (!at) {
        run()
        return
      }
      const delay = at - Date.now()
      if (delay <= 0) run()
      else resumeTimerRef.current = window.setTimeout(run, delay)
    },
    [emu, clearResumeTimer],
  )

  const onRemoteHold = useCallback(() => {
    remoteHoldRef.current = true
    clearResumeTimer()
    pauseForHold()
  }, [pauseForHold, clearResumeTimer])

  const onRemoteHoldRelease = useCallback(
    (at?: number) => {
      remoteHoldRef.current = false
      tryResume(at)
    },
    [tryResume],
  )

  useEffect(() => {
    if (!enabled || !playing) return

    const onVisibility = () => {
      const hidden = document.visibilityState !== 'visible'
      localHiddenRef.current = hidden
      if (hidden) {
        clearResumeTimer()
        pauseForHold()
        sendHold()
        return
      }

      const at = Date.now() + 200
      sendHoldRelease(at)
      tryResume(at)
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled, playing, pauseForHold, sendHold, sendHoldRelease, tryResume, clearResumeTimer])

  useEffect(() => {
    if (!enabled) {
      localHiddenRef.current = false
      remoteHoldRef.current = false
      wasRunningRef.current = false
      clearResumeTimer()
    }
  }, [enabled, clearResumeTimer])

  useEffect(() => () => clearResumeTimer(), [clearResumeTimer])

  return { onRemoteHold, onRemoteHoldRelease }
}
