import { useCallback, useEffect, useRef, useState } from 'react'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { ModeHookBase } from './types'

export interface UseRemoteGuestOptions extends ModeHookBase {
  peer: UsePeerSessionResult
}

/** Guest remote mode: display video stream and send input. */
export function useRemoteGuest({ enabled, peer }: UseRemoteGuestOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [needsTap, setNeedsTap] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const stream = peer.remoteStream
    const video = videoRef.current
    if (!stream || !video) return
    video.srcObject = stream
    void video.play().catch(() => setNeedsTap(true))
  }, [enabled, peer.remoteStream])

  const unmute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    void video.play().then(() => setNeedsTap(false))
  }, [])

  return {
    videoRef,
    needsTap,
    unmute,
    latencyMs: peer.latencyMs,
    latencyProfile: peer.latencyProfile,
    onPress: (button: string) => peer.sendInput(button, true),
    onRelease: (button: string) => peer.sendInput(button, false),
  }
}
