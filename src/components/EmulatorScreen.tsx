import type { RefObject } from 'react'
import type { SystemId } from '../lib/cores'
import { SYSTEMS } from '../lib/cores'

interface EmulatorScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  system: SystemId | null
  status: string
  isFullscreen?: boolean
  /** When true, on-screen controls float over the stage (landscape / setting). */
  padOverlay?: boolean
  children?: React.ReactNode
}

export function EmulatorScreen({
  canvasRef,
  system,
  status,
  isFullscreen,
  padOverlay = false,
  children,
}: EmulatorScreenProps) {
  const aspect = system ? SYSTEMS[system].aspectRatio : '4 / 3'
  const showPlaceholder = status === 'idle' || status === 'error'

  return (
    <div className={`play-shell${padOverlay ? ' play-shell--pad-overlay' : ''}`}>
      <div
        className={`play-stage${padOverlay ? ' play-stage--pad-overlay' : ''}`}
        style={isFullscreen || padOverlay ? undefined : { aspectRatio: aspect }}
      >
        <canvas
          id="canvas"
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
        {children}
      </div>
    </div>
  )
}
