import type { Nostalgist } from 'nostalgist'

interface AlcContext {
  audioCtx?: AudioContext
  gain?: GainNode
}

interface EmscriptenAL {
  currentCtx?: AlcContext
  contexts?: Record<number, AlcContext>
}

export interface RemoteCaptureResult {
  stream: MediaStream
  audioIncluded: boolean
  disconnectAudio?: () => void
}

function resolveAlContext(AL: EmscriptenAL | null | undefined): AlcContext | null {
  if (!AL) return null
  if (AL.currentCtx?.audioCtx && AL.currentCtx.gain) return AL.currentCtx
  for (const ctx of Object.values(AL.contexts ?? {})) {
    if (ctx?.audioCtx && ctx.gain) return ctx
  }
  return null
}

/** Tap RetroArch / Emscripten OpenAL output for WebRTC audio streaming. */
export function captureEmulatorAudioTrack(
  nostalgist: Nostalgist | null,
): { track: MediaStreamTrack; disconnect: () => void } | null {
  if (!nostalgist) return null
  try {
    const AL = nostalgist.getEmscriptenAL() as EmscriptenAL | undefined
    const ctx = resolveAlContext(AL)
    if (!ctx?.audioCtx || !ctx.gain) return null

    const dest = ctx.audioCtx.createMediaStreamDestination()
    ctx.gain.connect(dest)
    const track = dest.stream.getAudioTracks()[0]
    if (!track) {
      try {
        ctx.gain.disconnect(dest)
      } catch {
        // ignore
      }
      return null
    }

    return {
      track,
      disconnect: () => {
        try {
          ctx.gain?.disconnect(dest)
        } catch {
          // ignore
        }
      },
    }
  } catch {
    return null
  }
}

export function buildRemoteCaptureStream(
  canvas: HTMLCanvasElement,
  nostalgist: Nostalgist | null,
  fps: number,
  includeAudio: boolean,
): RemoteCaptureResult {
  const stream = canvas.captureStream(fps)
  if (!includeAudio) return { stream, audioIncluded: false }

  const audio = captureEmulatorAudioTrack(nostalgist)
  if (!audio) return { stream, audioIncluded: false }

  stream.addTrack(audio.track)
  return {
    stream,
    audioIncluded: true,
    disconnectAudio: audio.disconnect,
  }
}
