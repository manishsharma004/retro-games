import type { RefObject } from 'react'
import type { SystemId } from '../lib/cores'
import { SYSTEMS } from '../lib/cores'

interface EmulatorScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  system: SystemId | null
  status: string
  shellRef: RefObject<HTMLDivElement | null>
  children?: React.ReactNode
}

export function EmulatorScreen({
  canvasRef,
  system,
  status,
  shellRef,
  children,
}: EmulatorScreenProps) {
  const aspect = system ? SYSTEMS[system].aspectRatio : '4 / 3'
  const showPlaceholder = status === 'idle' || status === 'error'

  return (
    <div className="play-shell" ref={shellRef}>
      <div className="play-stage" style={{ aspectRatio: aspect }}>
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
