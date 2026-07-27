import { useCallback, useRef, type CSSProperties, type PointerEvent } from 'react'
import type { SystemId } from '../lib/cores'
import {
  buttonStyle,
  layoutUsesCustomPositions,
  resolveLayoutZones,
  resolveZoneButtons,
  zoneStyle,
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
  /** Extra scale multiplier (e.g. portrait boost so thumbs fit vertical layouts). */
  scaleBoost?: number
  /** When true, zones are outlined for the layout editor preview. */
  editing?: boolean
  hiddenElements?: Set<string>
  editorGlobalScale?: number
}

const SIZE_SCALE: Record<VirtualControllerProps['size'], number> = {
  small: 0.8,
  medium: 1,
  large: 1.25,
}

function asCss(style: ReturnType<typeof buttonStyle>): CSSProperties {
  return style as CSSProperties
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
  scaleBoost = 1,
  editing = false,
  hiddenElements,
  editorGlobalScale = 1,
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
    '--vp-scale': SIZE_SCALE[size] * scaleBoost,
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

  const mergeBtn = (
    zoneId: string,
    buttonId: string,
    button: VirtualLayoutButton | undefined,
  ): CSSProperties | undefined => {
    if (!button) return hiddenStyle(zoneId, buttonId)
    return { ...asCss(buttonStyle(button)), ...hiddenStyle(zoneId, buttonId) }
  }

  const zoneCss = (zone: { x: number; y: number; scale?: number } | undefined) =>
    zone ? zoneStyleWithGlobal(zone) : undefined

  const isHidden = (zoneId: string, buttonId?: string) => {
    if (!hiddenElements?.size) return false
    const zoneKey = `zone:${zoneId}`
    const buttonKey = buttonId ? `button:${zoneId}:${buttonId}` : null
    if (hiddenElements.has(zoneKey) && !buttonId) return true
    if (buttonKey && hiddenElements.has(buttonKey)) return true
    return false
  }

  const hiddenStyle = (zoneId: string, buttonId?: string): CSSProperties | undefined =>
    isHidden(zoneId, buttonId) ? { visibility: 'hidden', pointerEvents: 'none' } : undefined

  const zoneStyleWithGlobal = (zone: { x: number; y: number; scale?: number }) => {
    const base = zoneStyle(zone)
    const scale = (zone.scale ?? 1) * editorGlobalScale
    return {
      ...base,
      transform: `translate(-50%, -50%) scale(${scale})`,
    } as CSSProperties
  }

  const renderDpad = () => {
    if (leftCustomButtons) {
      return (
        <div className="vp-dpad vp-dpad--custom" role="group" aria-label="D-pad">
          <button
            type="button"
            className="vp-btn vp-dpad__btn"
            style={mergeBtn('left', 'up', leftButtons.up)}
            tabIndex={-1}
            data-layout-button="up"
            {...bind('up')}
            aria-label="Up"
          />
          <button
            type="button"
            className="vp-btn vp-dpad__btn"
            style={mergeBtn('left', 'left', leftButtons.left)}
            tabIndex={-1}
            data-layout-button="left"
            {...bind('left')}
            aria-label="Left"
          />
          <div className="vp-dpad__center" />
          <button
            type="button"
            className="vp-btn vp-dpad__btn"
            style={mergeBtn('left', 'right', leftButtons.right)}
            tabIndex={-1}
            data-layout-button="right"
            {...bind('right')}
            aria-label="Right"
          />
          <button
            type="button"
            className="vp-btn vp-dpad__btn"
            style={mergeBtn('left', 'down', leftButtons.down)}
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
        style={
          leftCustomButtons && leftButtons.stick
            ? mergeBtn('left', 'stick', leftButtons.stick)
            : hiddenStyle('left', 'stick')
        }
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
      style={{
        ...(customLayout && leftZone ? zoneCss(leftZone) : undefined),
        ...hiddenStyle('left'),
      }}
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
        style={{
          ...(customLayout && shouldersZone ? zoneCss(shouldersZone) : undefined),
          ...hiddenStyle('shoulders'),
        }}
        data-layout-zone="shoulders"
      >
        {isSnes && (
          <>
            <button
              type="button"
              className="vp-btn vp-btn--shoulder"
              style={shouldersCustomButtons ? mergeBtn('shoulders', 'l', shoulderButtons.l) : undefined}
              tabIndex={-1}
              data-layout-button="l"
              {...bind('l')}
            >
              L
            </button>
            <button
              type="button"
              className="vp-btn vp-btn--shoulder"
              style={shouldersCustomButtons ? mergeBtn('shoulders', 'r', shoulderButtons.r) : undefined}
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
          style={{
            ...(customLayout && metaZone ? zoneCss(metaZone) : undefined),
            ...hiddenStyle('meta'),
          }}
          data-layout-zone="meta"
        >
          <button
            type="button"
            className="vp-btn vp-btn--meta"
            style={metaCustomButtons ? mergeBtn('meta', 'select', metaButtons.select) : undefined}
            tabIndex={-1}
            data-layout-button="select"
            {...bind('select')}
          >
            Select
          </button>
          <button
            type="button"
            className="vp-btn vp-btn--meta"
            style={metaCustomButtons ? mergeBtn('meta', 'start', metaButtons.start) : undefined}
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
          style={{
            ...(customLayout && actionsZone ? zoneCss(actionsZone) : undefined),
            ...hiddenStyle('actions'),
          }}
          data-layout-zone="actions"
        >
          {isSnes && (
            <>
              <button
                type="button"
                className="vp-btn vp-btn--face vp-btn--y"
                style={actionsCustomButtons ? mergeBtn('actions', 'y', actionButtons.y) : undefined}
                tabIndex={-1}
                data-layout-button="y"
                {...bind('y')}
              >
                Y
              </button>
              <button
                type="button"
                className="vp-btn vp-btn--face vp-btn--x"
                style={actionsCustomButtons ? mergeBtn('actions', 'x', actionButtons.x) : undefined}
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
            style={actionsCustomButtons ? mergeBtn('actions', 'b', actionButtons.b) : undefined}
            tabIndex={-1}
            data-layout-button="b"
            {...bind('b')}
          >
            B
          </button>
          <button
            type="button"
            className="vp-btn vp-btn--face vp-btn--a"
            style={actionsCustomButtons ? mergeBtn('actions', 'a', actionButtons.a) : undefined}
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
