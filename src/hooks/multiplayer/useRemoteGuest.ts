import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { LatencyProfile } from '../../lib/peer'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { ModeHookBase } from './types'

export interface UseRemoteGuestOptions extends ModeHookBase {
  peer: UsePeerSessionResult
}

export interface UseRemoteGuestResult {
  videoRef: RefObject<HTMLVideoElement | null>
  needsTap: boolean
  hasVideo: boolean
  unmute: () => void
  latencyMs: number | null
  latencyProfile: LatencyProfile
  onPress: (button: string) => void
  onRelease: (button: string) => void
  releaseAll: () => void
}

/** Guest remote mode: display video stream and send input. */
export function useRemoteGuest({ enabled, peer }: UseRemoteGuestOptions): UseRemoteGuestResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [needsTap, setNeedsTap] = useState(false)
  const [hasVideo, setHasVideo] = useState(false)
  const pressedRef = useRef(new Set<string>())

  const releaseAll = useCallback(() => {
    for (const button of pressedRef.current) {
      peer.sendInput(button, false)
    }
    pressedRef.current.clear()
  }, [peer])

  useEffect(() => {
    if (peer.seat === null) releaseAll()
  }, [peer.seat, releaseAll])

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
      const video = videoRef.current
      if (!active || !video) return
      if (video.srcObject !== active) {
        video.srcObject = active
      } else {
        // replaceTrack updates may not fire addtrack — force a reload
        video.srcObject = null
        video.srcObject = active
      }
      const hasActiveTrack = active.getVideoTracks().some((t) => t.readyState === 'live')
      setHasVideo(hasActiveTrack)
      void video.play().catch(() => setNeedsTap(true))
    }

    const relayout = () => {
      const video = videoRef.current
      if (!video) return
      // Mobile browsers may keep intrinsic canvas capture dimensions until forced.
      video.style.width = '100%'
      video.style.height = '100%'
    }

    playStream()
    relayout()
    stream.addEventListener('addtrack', playStream)
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', playStream)
      track.addEventListener('mute', playStream)
      track.addEventListener('unmute', playStream)
    }
    video.addEventListener('loadedmetadata', relayout)
    video.addEventListener('resize', relayout)
    return () => {
      stream.removeEventListener('addtrack', playStream)
      for (const track of stream.getVideoTracks()) {
        track.removeEventListener('ended', playStream)
        track.removeEventListener('mute', playStream)
        track.removeEventListener('unmute', playStream)
      }
      video.removeEventListener('loadedmetadata', relayout)
      video.removeEventListener('resize', relayout)
    }
  }, [enabled, peer.remoteStream, peer.hostGame, peer.streamGeneration])

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
    onPress: (button: string) => {
      if (peer.seat === null) return
      pressedRef.current.add(button)
      peer.sendInput(button, true)
    },
    onRelease: (button: string) => {
      if (peer.seat === null) return
      pressedRef.current.delete(button)
      peer.sendInput(button, false)
    },
    releaseAll,
  }
}
