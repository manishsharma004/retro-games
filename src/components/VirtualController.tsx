import { useCallback, useRef, type CSSProperties, type PointerEvent } from 'react'
import type { SystemId } from '../lib/cores'
import {
  layoutUsesCustomPositions,
  resolveLayoutZones,
  type VirtualControlsLayout,
} from '../lib/virtualLayout'
import { VirtualStick } from './VirtualStick'

type ButtonName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'l'
  | 'r'
  | 'start'
  | 'select'

interface VirtualControllerProps {
  system: SystemId
  onPress: (button: string) => void
  onRelease: (button: string) => void
  visible: boolean
  dpadMode: 'dpad' | 'stick'
  overlay: boolean
  size: 'small' | 'medium' | 'large'
  opacity: number
  layout: VirtualControlsLayout
  /** When true, zones are outlined for the layout editor preview. */
  editing?: boolean
}

const SIZE_SCALE: Record<VirtualControllerProps['size'], number> = {
  small: 0.8,
  medium: 1,
  large: 1.25,
}

function zonePositionStyle(x: number, y: number): CSSProperties {
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: 'translate(-50%, -50%)',
  }
}

export function VirtualController({
  system,
  onPress,
  onRelease,
  visible,
  dpadMode,
  overlay,
  size,
  opacity,
  layout,
  editing = false,
}: VirtualControllerProps) {
  const active = useRef(new Set<string>())

  const bind = useCallback(
    (button: ButtonName) => ({
      onPointerDown: (e: PointerEvent) => {
        if (editing) return
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        if (!active.current.has(button)) {
          active.current.add(button)
          onPress(button)
        }
      },
      onPointerUp: (e: PointerEvent) => {
        if (editing) return
        e.preventDefault()
        if (active.current.has(button)) {
          active.current.delete(button)
          onRelease(button)
        }
      },
      onPointerCancel: () => {
        if (editing) return
        if (active.current.has(button)) {
          active.current.delete(button)
          onRelease(button)
        }
      },
    }),
    [editing, onPress, onRelease],
  )

  if (!visible) return null

  const isSnes = system === 'snes'
  const customLayout = layoutUsesCustomPositions(layout)
  const zonePositions = resolveLayoutZones(layout)

  const style = {
    '--vp-scale': SIZE_SCALE[size],
    '--vp-opacity': opacity,
  } as CSSProperties

  const padClass = [
    'virtual-pad',
    overlay ? 'virtual-pad--overlay' : '',
    customLayout ? 'virtual-pad--custom-layout' : '',
    editing ? 'virtual-pad--editing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const shouldersStyle =
    customLayout && zonePositions?.shoulders
      ? zonePositionStyle(zonePositions.shoulders.x, zonePositions.shoulders.y)
      : undefined

  const leftStyle =
    customLayout && zonePositions?.left
      ? zonePositionStyle(zonePositions.left.x, zonePositions.left.y)
      : undefined

  const metaStyle =
    customLayout && zonePositions?.meta
      ? zonePositionStyle(zonePositions.meta.x, zonePositions.meta.y)
      : undefined

  const actionsStyle =
    customLayout && zonePositions?.actions
      ? zonePositionStyle(zonePositions.actions.x, zonePositions.actions.y)
      : undefined

  return (
    <div className={padClass} style={style} aria-label="On-screen controller">
      <div
        className={`virtual-pad__shoulders${customLayout ? ' vp-zone vp-zone--shoulders' : ''}`}
        style={shouldersStyle}
      >
        {isSnes && (
          <>
            <button type="button" className="vp-btn vp-btn--shoulder" tabIndex={-1} {...bind('l')}>
              L
            </button>
            <button type="button" className="vp-btn vp-btn--shoulder" tabIndex={-1} {...bind('r')}>
              R
            </button>
          </>
        )}
      </div>

      <div className="virtual-pad__main">
        <div
          className={`${customLayout ? 'vp-zone vp-zone--left' : ''}`}
          style={leftStyle}
        >
          {dpadMode === 'stick' ? (
            <VirtualStick onPress={onPress} onRelease={onRelease} disabled={editing} />
          ) : (
            <div className="vp-dpad" role="group" aria-label="D-pad">
              <button type="button" className="vp-btn vp-dpad__up" tabIndex={-1} {...bind('up')} aria-label="Up" />
              <button
                type="button"
                className="vp-btn vp-dpad__left"
                tabIndex={-1}
                {...bind('left')}
                aria-label="Left"
              />
              <div className="vp-dpad__center" />
              <button
                type="button"
                className="vp-btn vp-dpad__right"
                tabIndex={-1}
                {...bind('right')}
                aria-label="Right"
              />
              <button
                type="button"
                className="vp-btn vp-dpad__down"
                tabIndex={-1}
                {...bind('down')}
                aria-label="Down"
              />
            </div>
          )}
        </div>

        <div className={`vp-meta${customLayout ? ' vp-zone vp-zone--meta' : ''}`} style={metaStyle}>
          <button type="button" className="vp-btn vp-btn--meta" tabIndex={-1} {...bind('select')}>
            Select
          </button>
          <button type="button" className="vp-btn vp-btn--meta" tabIndex={-1} {...bind('start')}>
            Start
          </button>
        </div>

        <div
          className={`vp-actions ${isSnes ? 'vp-actions--snes' : 'vp-actions--nes'}${customLayout ? ' vp-zone vp-zone--actions' : ''}`}
          style={actionsStyle}
        >
          {isSnes && (
            <>
              <button type="button" className="vp-btn vp-btn--face vp-btn--y" tabIndex={-1} {...bind('y')}>
                Y
              </button>
              <button type="button" className="vp-btn vp-btn--face vp-btn--x" tabIndex={-1} {...bind('x')}>
                X
              </button>
            </>
          )}
          <button type="button" className="vp-btn vp-btn--face vp-btn--b" tabIndex={-1} {...bind('b')}>
            B
          </button>
          <button type="button" className="vp-btn vp-btn--face vp-btn--a" tabIndex={-1} {...bind('a')}>
            A
          </button>
        </div>
      </div>
    </div>
  )
}
