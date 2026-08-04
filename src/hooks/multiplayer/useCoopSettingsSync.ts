import { useCallback, useEffect, useRef } from 'react'
import {
  buildCoopProfile,
  profileHash,
  profileRequiresRelaunch,
  profileToEmulatorSettings,
  saveSettings,
  type CoopEmulatorProfile,
  type EmulatorSettings,
} from '../../lib/settings'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'

export interface UseCoopSettingsSyncOptions {
  enabled: boolean
  isHost: boolean
  playing: boolean
  settings: EmulatorSettings
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  setSettings: (next: EmulatorSettings) => void
  lastProfileHashRef: React.MutableRefObject<string | null>
  lastProfileRef: React.MutableRefObject<CoopEmulatorProfile | null>
}

/** Host broadcasts profile changes; guest applies and relaunches when needed. */
export function useCoopSettingsSync({
  enabled,
  isHost,
  playing,
  settings,
  peer,
  emu,
  setSettings,
  lastProfileHashRef,
  lastProfileRef,
}: UseCoopSettingsSyncOptions) {
  const lastSentRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !isHost || !playing) return
    const profile = buildCoopProfile(settings)
    const hash = profileHash(profile)
    if (hash === lastSentRef.current) return
    lastSentRef.current = hash
    lastProfileHashRef.current = hash
    lastProfileRef.current = profile
    peer.sendSettingsSync(profile)
  }, [enabled, isHost, lastProfileHashRef, lastProfileRef, peer, playing, settings])

  const handleSettingsSync = useCallback(
    (profile: CoopEmulatorProfile, hash: string) => {
      if (isHost) return
      const prevProfile = lastProfileRef.current
      lastProfileHashRef.current = hash
      lastProfileRef.current = profile
      const merged = profileToEmulatorSettings(settings, profile)
      setSettings(merged)
      saveSettings(merged)
      if (profileRequiresRelaunch(prevProfile, profile)) {
        void emu.relaunchWithSettings()
        peer.requestResync()
      }
    },
    [emu, isHost, lastProfileHashRef, lastProfileRef, peer, setSettings, settings],
  )

  return { handleSettingsSync }
}
