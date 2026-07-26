import { useEffect, useRef } from 'react'
import {
  STANDARD_BUTTON_MAP,
  STICK_DEADZONE,
  resolvePadIndex,
  type ControllerBindings,
  type PadSlot,
} from '../lib/gamepad'
import type { RetroPadButton } from '../lib/keyboard'

interface UseGamepadControlsOptions {
  enabled: boolean
  bindings: ControllerBindings
  /** When set (peer mode), only this seat is driven from pad1 binding. */
  peerSeat?: 1 | 2 | null
  onPress: (button: string, player: number) => void
  onRelease: (button: string, player: number) => void
}

function stickHat(x: number, y: number): Set<RetroPadButton> {
  const out = new Set<RetroPadButton>()
  if (y <= -STICK_DEADZONE) out.add('up')
  if (y >= STICK_DEADZONE) out.add('down')
  if (x <= -STICK_DEADZONE) out.add('left')
  if (x >= STICK_DEADZONE) out.add('right')
  return out
}

function readActiveButtons(pad: Gamepad): Set<RetroPadButton> {
  const active = new Set<RetroPadButton>()
  for (const [btnIndex, button] of Object.entries(STANDARD_BUTTON_MAP)) {
    if (!button) continue
    if (pad.buttons[Number(btnIndex)]?.pressed) active.add(button)
  }
  if (pad.axes.length >= 2) {
    for (const dir of stickHat(pad.axes[0] ?? 0, pad.axes[1] ?? 0)) active.add(dir)
  }
  return active
}

/**
 * Poll the Gamepad API and route buttons through the same press bridge as
 * keyboard / virtual pad (so peer sendInput and seat mapping work).
 */
export function useGamepadControls({
  enabled,
  bindings,
  peerSeat = null,
  onPress,
  onRelease,
}: UseGamepadControlsOptions): void {
  const onPressRef = useRef(onPress)
  const onReleaseRef = useRef(onRelease)
  const bindingsRef = useRef(bindings)
  const peerSeatRef = useRef(peerSeat)
  onPressRef.current = onPress
  onReleaseRef.current = onRelease
  bindingsRef.current = bindings
  peerSeatRef.current = peerSeat

  useEffect(() => {
    if (!enabled) return

    const heldByPlayer = new Map<number, Set<RetroPadButton>>()

    const applySeat = (player: 1 | 2, next: Set<RetroPadButton>) => {
      const prev = heldByPlayer.get(player) ?? new Set<RetroPadButton>()
      for (const button of next) {
        if (!prev.has(button)) onPressRef.current(button, player)
      }
      for (const button of prev) {
        if (!next.has(button)) onReleaseRef.current(button, player)
      }
      if (next.size === 0) heldByPlayer.delete(player)
      else heldByPlayer.set(player, next)
    }

    const clearSeat = (player: number) => {
      const prev = heldByPlayer.get(player)
      if (!prev) return
      for (const button of prev) onReleaseRef.current(button, player)
      heldByPlayer.delete(player)
    }

    const releaseAll = () => {
      for (const player of [...heldByPlayer.keys()]) clearSeat(player)
    }

    const pollSeat = (player: 1 | 2, slot: PadSlot, pads: (Gamepad | null)[]) => {
      const indices = pads.filter((p): p is Gamepad => Boolean(p)).map((p) => p.index)
      const index = resolvePadIndex(slot, player, indices)
      if (index === null) {
        clearSeat(player)
        return
      }
      const pad = pads.find((p) => p?.index === index)
      if (!pad) {
        clearSeat(player)
        return
      }
      applySeat(player, readActiveButtons(pad))
    }

    let raf = 0
    const tick = () => {
      const pads = (navigator.getGamepads?.() ?? []) as (Gamepad | null)[]
      const seat = peerSeatRef.current
      const { pad1, pad2 } = bindingsRef.current

      if (seat === 1 || seat === 2) {
        pollSeat(seat, pad1, pads)
        clearSeat(seat === 1 ? 2 : 1)
      } else {
        pollSeat(1, pad1, pads)
        pollSeat(2, pad2, pads)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') releaseAll()
    }
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibility)
      releaseAll()
    }
  }, [enabled])
}
