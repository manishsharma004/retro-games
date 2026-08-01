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
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

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

  useEffect(() => {
    if (!enabled || peer.phase !== 'playing') return
    const id = window.setInterval(() => {
      const t = Date.now()
      try {
        peer.sendPing(t)
      } catch {
        // ignore
      }
    }, 3000)
    return () => window.clearInterval(id)
  }, [enabled, peer])

  return {
    videoRef,
    needsTap,
    unmute,
    latencyMs,
    setLatencyMs,
    onPress: (button: string) => peer.sendInput(button, true),
    onRelease: (button: string) => peer.sendInput(button, false),
  }
}
