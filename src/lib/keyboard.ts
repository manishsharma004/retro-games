/**
 * Keyboard → RetroPad mapping and RetroArch internal key bindings.
 *
 * Why this exists:
 * Nostalgist/RetroArch delivers keyboard input via document listeners, but
 * drops events when focus is on an "interactable" element (buttons, inputs).
 * Toolbar / on-screen control buttons routinely steal focus, so holding Z
 * (B) and then tapping X (A) or an arrow often looks like a missed press.
 *
 * We drive Retropad buttons ourselves via nostalgist.pressDown/pressUp, and
 * bind RetroArch to obscure keys the user never presses so the native path
 * cannot double-fire or race with our bridge.
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

/**
 * RetroArch config keys used as the transport for pressDown/pressUp.
 * These must exist in the Emscripten rwebinput code map (F1–F15, Numpad*).
 */
export const INTERNAL_RETROARCH_KEY_BINDS: Record<string, string> = {
  input_player1_b: 'f13',
  input_player1_a: 'f14',
  input_player1_y: 'f15',
  input_player1_x: 'num9',
  input_player1_l: 'num7',
  input_player1_r: 'num3',
  input_player1_up: 'num8',
  input_player1_down: 'num2',
  input_player1_left: 'num4',
  input_player1_right: 'num6',
  input_player1_start: 'num5',
  input_player1_select: 'num0',
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
