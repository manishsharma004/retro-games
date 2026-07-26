/**
 * Keyboard → RetroPad mapping.
 *
 * Why this exists:
 * Nostalgist/RetroArch delivers keyboard input via document listeners, but
 * drops events when focus is on an "interactable" element (buttons, inputs).
 * Toolbar / on-screen control buttons routinely steal focus, so holding Z
 * (B) and then tapping X (A) or an arrow often looks like a missed press.
 *
 * We drive Retropad buttons ourselves via nostalgist.pressDown/pressUp and
 * stopPropagation on game keys so the native path cannot race with us.
 * RetroArch keeps its default Z/X/arrow binds — those are what pressDown
 * synthesizes (see nostalgist getKeyboardCode).
 */

export type RetroPadButton =
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

/** Physical KeyboardEvent.code → RetroPad button (RetroArch defaults). */
export const KEYBOARD_CODE_TO_BUTTON: Record<string, RetroPadButton> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyZ: 'b',
  KeyX: 'a',
  KeyA: 'y',
  KeyS: 'x',
  KeyQ: 'l',
  KeyW: 'r',
  Enter: 'start',
  NumpadEnter: 'start',
  ShiftLeft: 'select',
  ShiftRight: 'select',
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
