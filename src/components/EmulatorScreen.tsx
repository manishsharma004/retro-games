import type { RefObject } from 'react'
import type { SystemId } from '../lib/cores'
import { CANVAS_LAYOUT_HEIGHT, CANVAS_LAYOUT_WIDTH } from '../lib/canvasLock'

interface EmulatorScreenProps {
  frameRef: RefObject<HTMLIFrameElement | null>
  hostRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  system: SystemId | null
  status: string
  shellRef: RefObject<HTMLDivElement | null>
  isFullscreen?: boolean
  children?: React.ReactNode
}

export function EmulatorScreen({
  frameRef,
  hostRef,
  stageRef,
  system: _system,
  status,
  shellRef,
  isFullscreen: _isFullscreen,
  children,
}: EmulatorScreenProps) {
  const showPlaceholder = status === 'idle' || status === 'error'
  const frameSrc = `${import.meta.env.BASE_URL}emulator-frame.html`

  return (
    <div className="play-shell" ref={shellRef}>
      <div className="play-stage-host" ref={hostRef}>
        <div className="play-stage" ref={stageRef}>
          <iframe
            ref={frameRef}
            className={`play-frame ${showPlaceholder ? 'play-frame--hidden' : ''}`}
            title="Retro Games emulator"
            src={frameSrc}
            width={CANVAS_LAYOUT_WIDTH}
            height={CANVAS_LAYOUT_HEIGHT}
            // Same-origin frame; allow autoplay/gamepad for the WASM core.
            allow="autoplay; gamepad"
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
