import { useEffect, useRef } from 'react'
import {
  activePlayerSeats,
  readRetroButtons,
  resolveSeatPads,
  type ControllerBindings,
  type PlayerSeat,
} from '../lib/gamepad'
import type { RetroPadButton } from '../lib/keyboard'

interface UseGamepadControlsOptions {
  enabled: boolean
  bindings: ControllerBindings
  /** When set (peer mode), only this seat is driven from its pad binding. */
  peerSeat?: PlayerSeat | null
  /** Local couch seats to poll when not in single-seat peer mode. */
  maxLocalSeats?: number
  onPress: (button: string, player: number) => void
  onRelease: (button: string, player: number) => void
}

/**
 * Poll the Gamepad API and route buttons through the same press bridge as
 * keyboard / virtual pad (so peer sendInput and seat mapping work).
 */
export function useGamepadControls({
  enabled,
  bindings,
  peerSeat = null,
  maxLocalSeats = 2,
  onPress,
  onRelease,
}: UseGamepadControlsOptions): void {
  const onPressRef = useRef(onPress)
  const onReleaseRef = useRef(onRelease)
  const bindingsRef = useRef(bindings)
  const peerSeatRef = useRef(peerSeat)
  const maxLocalSeatsRef = useRef(maxLocalSeats)
  onPressRef.current = onPress
  onReleaseRef.current = onRelease
  bindingsRef.current = bindings
  peerSeatRef.current = peerSeat
  maxLocalSeatsRef.current = maxLocalSeats

  useEffect(() => {
    if (!enabled) return

    const heldByPlayer = new Map<number, Set<RetroPadButton>>()

    const applySeat = (player: PlayerSeat, next: Set<RetroPadButton>) => {
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

    const pollSeat = (player: PlayerSeat, index: number | null, pads: (Gamepad | null)[]) => {
      if (index === null) {
        clearSeat(player)
        return
      }
      const pad = pads.find((entry) => entry?.index === index)
      if (!pad) {
        clearSeat(player)
        return
      }
      applySeat(player, readRetroButtons(pad))
    }

    let raf = 0
    const tick = () => {
      const pads = (navigator.getGamepads?.() ?? []) as (Gamepad | null)[]
      const indices = pads.filter((entry): entry is Gamepad => Boolean(entry)).map((entry) => entry.index)
      const seat = peerSeatRef.current
      const localSeats = activePlayerSeats(maxLocalSeatsRef.current)
      const seats =
        seat !== null && seat >= 1 && seat <= 5 ? [seat] : localSeats
      const resolved = resolveSeatPads(bindingsRef.current, seats, indices)

      for (const player of seats) {
        pollSeat(player, resolved.get(player) ?? null, pads)
      }
      if (seat !== null) {
        for (const other of localSeats) {
          if (other !== seat) clearSeat(other)
        }
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
