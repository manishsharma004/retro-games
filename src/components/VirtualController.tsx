import { useCallback, useRef, type CSSProperties, type PointerEvent } from 'react'
import type { SystemId } from '../lib/cores'
import {
  layoutUsesCustomPositions,
  resolveLayoutZones,
  resolveZoneButtons,
  zoneUsesCustomButtons,
  type VirtualControlsLayout,
  type VirtualLayoutButton,
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

function buttonLayoutStyle(button: VirtualLayoutButton): CSSProperties {
  return {
    left: `${button.x}%`,
    top: `${button.y}%`,
    transform: `translate(-50%, -50%) scale(${button.scale})`,
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

  const leftZone = zonePositions?.left
  const metaZone = zonePositions?.meta
  const actionsZone = zonePositions?.actions
  const shouldersZone = zonePositions?.shoulders

  const leftCustomButtons = zoneUsesCustomButtons(leftZone)
  const metaCustomButtons = zoneUsesCustomButtons(metaZone)
  const actionsCustomButtons = zoneUsesCustomButtons(actionsZone)
  const shouldersCustomButtons = zoneUsesCustomButtons(shouldersZone)

  const leftButtons = resolveZoneButtons(leftZone, 'left', system, dpadMode)
  const metaButtons = resolveZoneButtons(metaZone, 'meta', system, dpadMode)
  const actionButtons = resolveZoneButtons(actionsZone, 'actions', system, dpadMode)
  const shoulderButtons = resolveZoneButtons(shouldersZone, 'shoulders', system, dpadMode)

  const renderDpad = () => {
    if (leftCustomButtons) {
      return (
        <div className="vp-dpad vp-dpad--custom" role="group" aria-label="D-pad">
          <button
            type="button"
            className="vp-btn vp-dpad__up"
            style={buttonLayoutStyle(leftButtons.up!)}
            tabIndex={-1}
            data-layout-button="up"
            {...bind('up')}
            aria-label="Up"
          />
          <button
            type="button"
            className="vp-btn vp-dpad__left"
            style={buttonLayoutStyle(leftButtons.left!)}
            tabIndex={-1}
            data-layout-button="left"
            {...bind('left')}
            aria-label="Left"
          />
          <div className="vp-dpad__center" />
          <button
            type="button"
            className="vp-btn vp-dpad__right"
            style={buttonLayoutStyle(leftButtons.right!)}
            tabIndex={-1}
            data-layout-button="right"
            {...bind('right')}
            aria-label="Right"
          />
          <button
            type="button"
            className="vp-btn vp-dpad__down"
            style={buttonLayoutStyle(leftButtons.down!)}
            tabIndex={-1}
            data-layout-button="down"
            {...bind('down')}
            aria-label="Down"
          />
        </div>
      )
    }

    return (
      <div className="vp-dpad" role="group" aria-label="D-pad">
        <button type="button" className="vp-btn vp-dpad__up" tabIndex={-1} data-layout-button="up" {...bind('up')} aria-label="Up" />
        <button type="button" className="vp-btn vp-dpad__left" tabIndex={-1} data-layout-button="left" {...bind('left')} aria-label="Left" />
        <div className="vp-dpad__center" />
        <button type="button" className="vp-btn vp-dpad__right" tabIndex={-1} data-layout-button="right" {...bind('right')} aria-label="Right" />
        <button type="button" className="vp-btn vp-dpad__down" tabIndex={-1} data-layout-button="down" {...bind('down')} aria-label="Down" />
      </div>
    )
  }

  const leftContent =
    dpadMode === 'stick' ? (
      <VirtualStick
        onPress={onPress}
        onRelease={onRelease}
        disabled={editing}
        style={leftCustomButtons && leftButtons.stick ? buttonLayoutStyle(leftButtons.stick) : undefined}
        className={leftCustomButtons ? 'vp-stick--custom' : undefined}
      />
    ) : (
      renderDpad()
    )

  const leftWrapperClass = [
    customLayout ? 'vp-zone vp-zone--left' : 'vp-zone-marker',
    leftCustomButtons ? 'vp-zone--custom-buttons' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const leftNode = (
    <div
      className={leftWrapperClass}
      style={customLayout && leftZone ? zonePositionStyle(leftZone.x, leftZone.y) : undefined}
      data-layout-zone="left"
    >
      {leftContent}
    </div>
  )

  return (
    <div className={padClass} style={style} aria-label="On-screen controller">
      <div
        className={[
          'virtual-pad__shoulders',
          customLayout ? 'vp-zone vp-zone--shoulders' : '',
          shouldersCustomButtons ? 'vp-zone--custom-buttons' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={customLayout && shouldersZone ? zonePositionStyle(shouldersZone.x, shouldersZone.y) : undefined}
        data-layout-zone="shoulders"
      >
        {isSnes && (
          <>
            <button
              type="button"
              className="vp-btn vp-btn--shoulder"
              style={shouldersCustomButtons && shoulderButtons.l ? buttonLayoutStyle(shoulderButtons.l) : undefined}
              tabIndex={-1}
              data-layout-button="l"
              {...bind('l')}
            >
              L
            </button>
            <button
              type="button"
              className="vp-btn vp-btn--shoulder"
              style={shouldersCustomButtons && shoulderButtons.r ? buttonLayoutStyle(shoulderButtons.r) : undefined}
              tabIndex={-1}
              data-layout-button="r"
              {...bind('r')}
            >
              R
            </button>
          </>
        )}
      </div>

      <div className="virtual-pad__main">
        {leftNode}

        <div
          className={[
            'vp-meta',
            customLayout ? 'vp-zone vp-zone--meta' : '',
            metaCustomButtons ? 'vp-zone--custom-buttons' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={customLayout && metaZone ? zonePositionStyle(metaZone.x, metaZone.y) : undefined}
          data-layout-zone="meta"
        >
          <button
            type="button"
            className="vp-btn vp-btn--meta"
            style={metaCustomButtons && metaButtons.select ? buttonLayoutStyle(metaButtons.select) : undefined}
            tabIndex={-1}
            data-layout-button="select"
            {...bind('select')}
          >
            Select
          </button>
          <button
            type="button"
            className="vp-btn vp-btn--meta"
            style={metaCustomButtons && metaButtons.start ? buttonLayoutStyle(metaButtons.start) : undefined}
            tabIndex={-1}
            data-layout-button="start"
            {...bind('start')}
          >
            Start
          </button>
        </div>

        <div
          className={[
            'vp-actions',
            isSnes ? 'vp-actions--snes' : 'vp-actions--nes',
            customLayout ? 'vp-zone vp-zone--actions' : '',
            actionsCustomButtons ? 'vp-zone--custom-buttons' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={customLayout && actionsZone ? zonePositionStyle(actionsZone.x, actionsZone.y) : undefined}
          data-layout-zone="actions"
        >
          {isSnes && (
            <>
              <button
                type="button"
                className="vp-btn vp-btn--face vp-btn--y"
                style={actionsCustomButtons && actionButtons.y ? buttonLayoutStyle(actionButtons.y) : undefined}
                tabIndex={-1}
                data-layout-button="y"
                {...bind('y')}
              >
                Y
              </button>
              <button
                type="button"
                className="vp-btn vp-btn--face vp-btn--x"
                style={actionsCustomButtons && actionButtons.x ? buttonLayoutStyle(actionButtons.x) : undefined}
                tabIndex={-1}
                data-layout-button="x"
                {...bind('x')}
              >
                X
              </button>
            </>
          )}
          <button
            type="button"
            className="vp-btn vp-btn--face vp-btn--b"
            style={actionsCustomButtons && actionButtons.b ? buttonLayoutStyle(actionButtons.b) : undefined}
            tabIndex={-1}
            data-layout-button="b"
            {...bind('b')}
          >
            B
          </button>
          <button
            type="button"
            className="vp-btn vp-btn--face vp-btn--a"
            style={actionsCustomButtons && actionButtons.a ? buttonLayoutStyle(actionButtons.a) : undefined}
            tabIndex={-1}
            data-layout-button="a"
            {...bind('a')}
          >
            A
          </button>
        </div>
      </div>
    </div>
  )
}
