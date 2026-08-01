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
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setHasVideo(false)
      return
    }

    const stream = peer.remoteStream
    const video = videoRef.current
    if (!stream || !video) return

    const playStream = () => {
      const active = peer.remoteStream
      if (!active || !videoRef.current) return
      if (videoRef.current.srcObject !== active) {
        videoRef.current.srcObject = active
      }
      const hasActiveTrack = active.getVideoTracks().some((t) => t.readyState === 'live')
      setHasVideo(hasActiveTrack)
      void videoRef.current.play().catch(() => setNeedsTap(true))
    }

    playStream()
    stream.addEventListener('addtrack', playStream)
    return () => stream.removeEventListener('addtrack', playStream)
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
    hasVideo,
    unmute,
    latencyMs: peer.latencyMs,
    latencyProfile: peer.latencyProfile,
    onPress: (button: string) => peer.sendInput(button, true),
    onRelease: (button: string) => peer.sendInput(button, false),
  }
}
