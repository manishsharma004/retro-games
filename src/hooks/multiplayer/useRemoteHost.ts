import { useEffect, useRef, useState } from 'react'
import { getIceConfig, readNetworkQuality, supportsCanvasCapture } from '../../lib/peer/connectivity'
import { buildRemoteCaptureStream } from '../../lib/remoteStreamCapture'
import type { UsePeerSessionResult } from '../usePeerSession'
import type { UseEmulatorResult } from '../useEmulator'
import type { ModeHookBase } from './types'

export interface UseRemoteHostOptions extends ModeHookBase {
  peer: UsePeerSessionResult
  emu: UseEmulatorResult
  isHost: boolean
  shareAudio?: boolean
  onVideoOnly?: () => void
}

/** Host remote mode: capture canvas stream and attach to WebRTC. */
export function useRemoteHost({
  enabled,
  peer,
  emu,
  isHost,
  shareAudio = true,
  onVideoOnly,
  streamGeneration = 0,
}: UseRemoteHostOptions & { streamGeneration?: number }) {
  const streamRef = useRef<MediaStream | null>(null)
  const disconnectAudioRef = useRef<(() => void) | null>(null)
  const [videoOnly, setVideoOnly] = useState(false)
  const [audioShared, setAudioShared] = useState(false)
  const captureFps = peer.latencyProfile.streamFps

  useEffect(() => {
    if (!enabled || !isHost) return
    if (peer.phase !== 'linked' && peer.phase !== 'playing') return
    if (emu.status !== 'running' && emu.status !== 'paused') return
    if (!supportsCanvasCapture()) return

    const canvas = emu.canvasRef.current
    const nostalgist = emu.getNostalgist?.()
    const target = nostalgist?.getCanvas?.() ?? canvas
    if (!target) return

    const { stream, audioIncluded, disconnectAudio } = buildRemoteCaptureStream(
      target,
      nostalgist ?? null,
      captureFps,
      shareAudio,
    )
    streamRef.current = stream
    disconnectAudioRef.current = disconnectAudio ?? null
    setAudioShared(audioIncluded)

    void peer.attachMediaStream(stream).catch(() => {
      setVideoOnly(true)
      onVideoOnly?.()
    })

    return () => {
      disconnectAudioRef.current?.()
      disconnectAudioRef.current = null
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setAudioShared(false)
    }
  }, [
    enabled,
    isHost,
    shareAudio,
    peer.phase,
    peer.attachMediaStream,
    emu,
    emu.game,
    emu.status,
    onVideoOnly,
    captureFps,
    streamGeneration,
  ])

  return {
    videoOnly,
    audioShared,
    captureFps,
    canCapture: supportsCanvasCapture(),
    network: readNetworkQuality(),
    iceTier: getIceConfig().connectivityTier,
    latencyMs: peer.latencyMs,
  }
}
