import type { RefObject } from 'react'
import type { SystemId } from '../lib/cores'
import { SYSTEMS } from '../lib/cores'

interface EmulatorScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  system: SystemId | null
  status: string
  shellRef: RefObject<HTMLDivElement | null>
  isFullscreen?: boolean
  children?: React.ReactNode
}

export function EmulatorScreen({
  canvasRef,
  system,
  status,
  shellRef,
  isFullscreen,
  children,
}: EmulatorScreenProps) {
  const aspect = system ? SYSTEMS[system].aspectRatio : '4 / 3'
  const showPlaceholder = status === 'idle' || status === 'error'

  return (
    <div className="play-shell" ref={shellRef}>
      {/* In fullscreen the stage fills all available space and the canvas keeps
          the aspect ratio via object-fit; windowed mode uses a fixed ratio box. */}
      <div className="play-stage" style={isFullscreen ? undefined : { aspectRatio: aspect }}>
        <canvas
          ref={canvasRef}
          className={`play-canvas ${showPlaceholder ? 'play-canvas--hidden' : ''}`}
          width={800}
          height={600}
        />
        {status === 'loading' && (
          <div className="play-overlay">
            <div className="spinner" />
            <p>Loading emulator core…</p>
          </div>
        )}
        {status === 'paused' && (
          <div className="play-overlay play-overlay--dim">
            <p className="play-overlay__title">Paused</p>
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
