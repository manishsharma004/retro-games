import { useEffect, useRef } from 'react'
import {
  KEYBOARD_CODE_TO_BUTTON,
  isTypingTarget,
  type RetroPadButton,
} from '../lib/keyboard'

interface UseKeyboardControlsOptions {
  enabled: boolean
  onPress: (button: string) => void
  onRelease: (button: string) => void
}

/**
 * Reliable multi-key keyboard controls for the emulator.
 * Tracks pressed buttons ourselves so focus filters cannot drop combos,
 * and so alternate keys (Space/X → A) can share a RetroPad button.
 */
export function useKeyboardControls({
  enabled,
  onPress,
  onRelease,
}: UseKeyboardControlsOptions): void {
  const onPressRef = useRef(onPress)
  const onReleaseRef = useRef(onRelease)
  onPressRef.current = onPress
  onReleaseRef.current = onRelease

  useEffect(() => {
    if (!enabled) return

    const heldButtons = new Set<RetroPadButton>()
    const heldCodes = new Map<string, RetroPadButton>()

    const press = (button: RetroPadButton) => {
      if (heldButtons.has(button)) return
      heldButtons.add(button)
      onPressRef.current(button)
    }

    const release = (button: RetroPadButton) => {
      if (!heldButtons.has(button)) return
      heldButtons.delete(button)
      onReleaseRef.current(button)
    }

    const releaseAll = () => {
      for (const button of [...heldButtons]) {
        onReleaseRef.current(button)
      }
      heldButtons.clear()
      heldCodes.clear()
    }

    const stillHeld = (button: RetroPadButton) => {
      for (const other of heldCodes.values()) {
        if (other === button) return true
      }
      return false
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      const button = KEYBOARD_CODE_TO_BUTTON[event.code]
      if (!button) return

      // Always claim game keys so the page cannot scroll / activate buttons.
      event.preventDefault()
      event.stopPropagation()

      if (event.repeat) return
      heldCodes.set(event.code, button)
      press(button)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const button = heldCodes.get(event.code) ?? KEYBOARD_CODE_TO_BUTTON[event.code]
      if (!button) return

      event.preventDefault()
      event.stopPropagation()
      heldCodes.delete(event.code)

      // Several physical keys can map to one button (Space + X → A, both Shifts
      // → Select). Only release when none of those keys remain down.
      if (stillHeld(button)) return
      release(button)
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') releaseAll()
    }

    // Capture phase so we run before Nostalgist's document listeners and
    // before a focused <button> can swallow the event.
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibility)
      releaseAll()
    }
  }, [enabled])
}
