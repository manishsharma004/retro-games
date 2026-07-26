/**
 * Keyboard → RetroPad mapping.
 *
 * Why this exists:
 * 1) Nostalgist drops document key events while focus is on interactable
 *    elements (toolbar / on-screen buttons).
 * 2) Hardware keyboard ghosting: on many boards Z + Arrow + X cannot be
 *    detected at once — exactly Mario's run (Z) + direction + jump (X).
 *    Space is wired on a different matrix line, so Z + Arrow + Space works.
 *
 * We drive Retropad via pressDown/pressUp and stopPropagation on game keys.
 * RetroArch keeps default Z/X/arrow binds (those are what pressDown
 * synthesizes). Space is an extra physical binding for A only in our bridge.
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

/** Physical KeyboardEvent.code → RetroPad button. */
export const KEYBOARD_CODE_TO_BUTTON: Record<string, RetroPadButton> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  // B = run. Keep Z (RetroArch default).
  KeyZ: 'b',
  // A = jump. Space avoids Z+Arrow+X ghosting on common membrane keyboards.
  // X remains as an alternate (RetroArch default) for 1–2 key presses.
  Space: 'a',
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
