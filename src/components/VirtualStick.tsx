import { useCallback, useRef, useState, type PointerEvent } from 'react'

type Direction = 'up' | 'down' | 'left' | 'right'

interface VirtualStickProps {
  onPress: (button: string) => void
  onRelease: (button: string) => void
}

/**
 * On-screen analog thumbstick. It translates the thumb position into digital
 * D-pad button presses (8-way, so a single thumb can hold diagonals like
 * Up+Right). RetroPad analog axes are not driven directly because the emulator
 * press API is digital only.
 */
export function VirtualStick({ onPress, onRelease }: VirtualStickProps) {
  const baseRef = useRef<HTMLDivElement>(null)
  const activeDirs = useRef<Set<Direction>>(new Set())
  const activePointer = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const releaseAll = useCallback(() => {
    for (const dir of activeDirs.current) onRelease(dir)
    activeDirs.current = new Set()
  }, [onRelease])

  const applyDirections = useCallback(
    (dx: number, dy: number, radius: number) => {
      const deadzone = radius * 0.28
      const axisThreshold = radius * 0.34
      const magnitude = Math.hypot(dx, dy)
      const next = new Set<Direction>()

      if (magnitude >= deadzone) {
        if (dy <= -axisThreshold) next.add('up')
        if (dy >= axisThreshold) next.add('down')
        if (dx <= -axisThreshold) next.add('left')
        if (dx >= axisThreshold) next.add('right')
      }

      for (const dir of next) {
        if (!activeDirs.current.has(dir)) onPress(dir)
      }
      for (const dir of activeDirs.current) {
        if (!next.has(dir)) onRelease(dir)
      }
      activeDirs.current = next
    },
    [onPress, onRelease],
  )

  const track = useCallback(
    (e: PointerEvent) => {
      const base = baseRef.current
      if (!base) return
      const rect = base.getBoundingClientRect()
      const radius = rect.width / 2
      const dx = e.clientX - (rect.left + radius)
      const dy = e.clientY - (rect.top + rect.height / 2)
      const magnitude = Math.hypot(dx, dy)
      const clamped = Math.min(magnitude, radius)
      const nx = magnitude > 0 ? (dx / magnitude) * clamped : 0
      const ny = magnitude > 0 ? (dy / magnitude) * clamped : 0
      setKnob({ x: nx, y: ny })
      applyDirections(dx, dy, radius)
    },
    [applyDirections],
  )

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault()
      const base = baseRef.current
      if (!base) return
      base.setPointerCapture(e.pointerId)
      activePointer.current = e.pointerId
      track(e)
    },
    [track],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (activePointer.current !== e.pointerId) return
      e.preventDefault()
      track(e)
    },
    [track],
  )

  const onPointerEnd = useCallback(
    (e: PointerEvent) => {
      if (activePointer.current !== e.pointerId) return
      activePointer.current = null
      setKnob({ x: 0, y: 0 })
      releaseAll()
    },
    [releaseAll],
  )

  return (
    <div
      ref={baseRef}
      className="vp-stick"
      role="group"
      aria-label="Analog stick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="vp-stick__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}
