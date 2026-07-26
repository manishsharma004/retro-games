import { useCallback, useRef, type CSSProperties, type PointerEvent } from 'react'
import type { SystemId } from '../lib/cores'
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
}

const SIZE_SCALE: Record<VirtualControllerProps['size'], number> = {
  small: 0.8,
  medium: 1,
  large: 1.25,
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
}: VirtualControllerProps) {
  const active = useRef(new Set<string>())

  const bind = useCallback(
    (button: ButtonName) => ({
      onPointerDown: (e: PointerEvent) => {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        if (!active.current.has(button)) {
          active.current.add(button)
          onPress(button)
        }
      },
      onPointerUp: (e: PointerEvent) => {
        e.preventDefault()
        if (active.current.has(button)) {
          active.current.delete(button)
          onRelease(button)
        }
      },
      onPointerCancel: () => {
        if (active.current.has(button)) {
          active.current.delete(button)
          onRelease(button)
        }
      },
    }),
    [onPress, onRelease],
  )

  if (!visible) return null

  const isSnes = system === 'snes'
  const style = {
    '--vp-scale': SIZE_SCALE[size],
    '--vp-opacity': opacity,
  } as CSSProperties

  return (
    <div
      className={`virtual-pad ${overlay ? 'virtual-pad--overlay' : ''}`}
      style={style}
      aria-label="On-screen controller"
    >
      <div className="virtual-pad__shoulders">
        {isSnes && (
          <>
            <button type="button" className="vp-btn vp-btn--shoulder" {...bind('l')}>
              L
            </button>
            <button type="button" className="vp-btn vp-btn--shoulder" {...bind('r')}>
              R
            </button>
          </>
        )}
      </div>

      <div className="virtual-pad__main">
        {dpadMode === 'stick' ? (
          <VirtualStick onPress={onPress} onRelease={onRelease} />
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

        <div className="vp-meta">
          <button type="button" className="vp-btn vp-btn--meta" {...bind('select')}>
            Select
          </button>
          <button type="button" className="vp-btn vp-btn--meta" {...bind('start')}>
            Start
          </button>
        </div>

        <div className={`vp-actions ${isSnes ? 'vp-actions--snes' : 'vp-actions--nes'}`}>
          {isSnes && (
            <>
              <button type="button" className="vp-btn vp-btn--face vp-btn--y" {...bind('y')}>
                Y
              </button>
              <button type="button" className="vp-btn vp-btn--face vp-btn--x" {...bind('x')}>
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
