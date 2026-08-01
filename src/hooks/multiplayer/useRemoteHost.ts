import { useEffect, useRef, useState } from 'react'
import { getIceConfig, readNetworkQuality, supportsCanvasCapture } from '../../lib/peer/connectivity'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'
import type { ModeHookBase } from './types'

export interface UseRemoteHostOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  isHost: boolean
  onVideoOnly?: () => void
}

/** Host remote mode: capture canvas stream and attach to WebRTC. */
export function useRemoteHost({ enabled, peer, emu, isHost, onVideoOnly }: UseRemoteHostOptions) {
  const streamRef = useRef<MediaStream | null>(null)
  const [videoOnly, setVideoOnly] = useState(false)
  const captureFps = peer.latencyProfile.streamFps

  useEffect(() => {
    if (!enabled || !isHost) return
    if (peer.phase !== 'linked' && peer.phase !== 'playing') return
    if (!supportsCanvasCapture()) return

    const canvas = emu.canvasRef.current
    const nostalgist = emu.getNostalgist?.()
    const target = nostalgist?.getCanvas?.() ?? canvas
    if (!target) return

    const stream = target.captureStream(captureFps)
    streamRef.current = stream

    void peer.attachMediaStream(stream).catch(() => {
      setVideoOnly(true)
      onVideoOnly?.()
    })

    return () => {
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [enabled, isHost, peer.phase, peer.attachMediaStream, emu, onVideoOnly, captureFps])

  return {
    videoOnly,
    captureFps,
    canCapture: supportsCanvasCapture(),
    network: readNetworkQuality(),
    iceTier: getIceConfig().connectivityTier,
    latencyMs: peer.latencyMs,
  }
}
