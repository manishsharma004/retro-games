import type { RefObject } from 'react'
import type { SystemId } from '../lib/cores'

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
  system: _system,
  status,
  shellRef,
  isFullscreen: _isFullscreen,
  children,
}: EmulatorScreenProps) {
  const showPlaceholder = status === 'idle' || status === 'error'

  return (
    <div className="play-shell" ref={shellRef}>
      {/* Host is the flexible viewport; stage is a fixed 800×600 box (same as the
          working nostalgist smoke test) scaled to fit via transform. */}
      <div className="play-stage-host">
        <div className="play-stage">
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
        </div>
      </div>
      {children}
    </div>
  )
}
