import type { RetroPadButton } from './keyboard'

/**
 * W3C standard gamepad → RetroPad.
 * South/East/West/North are Nintendo B/A/Y/X, which is also
 * Xbox A/B/X/Y and PlayStation Cross/Circle/Square/Triangle.
 */
export const STANDARD_BUTTON_MAP: Partial<Record<number, RetroPadButton>> = {
  0: 'b',
  1: 'a',
  2: 'y',
  3: 'x',
  4: 'l',
  5: 'r',
  8: 'select',
  9: 'start',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
}

/** Circular deadzone. Drift on Xbox and DualSense sticks usually stays under ~0.12. */
export const STICK_DEADZONE = 0.2

export type PadProfile = 'standard' | 'xbox' | 'playstation' | 'generic'

export interface PadSnapshot {
  id: string
  mapping: string
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>
  axes: ReadonlyArray<number>
}

const FACE_BUTTONS: Array<[number, RetroPadButton]> = [
  [0, 'b'],
  [1, 'a'],
  [2, 'y'],
  [3, 'x'],
  [4, 'l'],
  [5, 'r'],
]

/** How the browser exposed this pad. Standard covers current Chrome Xbox and PlayStation pads. */
export function padProfile(id: string, mapping: string): PadProfile {
  if (mapping === 'standard') return 'standard'
  const hay = id.toLowerCase()
  if (/xbox|x-box|xinput|045e|microsoft/.test(hay)) return 'xbox'
  if (/054c|sony|dualshock|dualsense|playstation|wireless controller|\bps[345]\b/.test(hay)) {
    return 'playstation'
  }
  return 'generic'
}

export function friendlyPadName(id: string): string {
  const hay = id.toLowerCase()
  if (/dualsense|0ce6|\bps5\b/.test(hay)) return 'DualSense'
  if (/dualshock\s*4|09cc|05c4|\bps4\b/.test(hay)) return 'DualShock 4'
  if (/dualshock|playstation|054c|sony/.test(hay)) return 'PlayStation'
  if (/xbox series|0b12|0b13/.test(hay)) return 'Xbox Series'
  if (/xbox\s*one|xbox wireless|02fd|02ea|02e0/.test(hay)) return 'Xbox'
  if (/xbox\s*360|028e/.test(hay)) return 'Xbox 360'
  if (/xbox|xinput|045e|microsoft/.test(hay)) return 'Xbox'
  return shortGamepadName(id)
}

export function padProfileLabel(profile: PadProfile): string {
  if (profile === 'standard') return 'Standard layout'
  if (profile === 'xbox') return 'Xbox direct layout'
  if (profile === 'playstation') return 'PlayStation direct layout'
  return 'Generic layout'
}

function buttonDown(pad: PadSnapshot, index: number): boolean {
  const button = pad.buttons[index]
  if (!button) return false
  return button.pressed || button.value >= 0.55
}

function addStick(active: Set<RetroPadButton>, x: number, y: number): void {
  const mag = Math.hypot(x, y)
  if (mag < STICK_DEADZONE) return
  const nx = x / mag
  const ny = y / mag
  const gate = 0.42
  if (ny <= -gate) active.add('up')
  if (ny >= gate) active.add('down')
  if (nx <= -gate) active.add('left')
  if (nx >= gate) active.add('right')
}

/** Hat axes rest at 0 and snap to ±1. Reject analog in-between values (triggers, right stick). */
function addHat(active: Set<RetroPadButton>, x: number, y: number): void {
  const digital = (value: number) => Math.abs(value) <= 0.35 || Math.abs(value) >= 0.75
  if (!digital(x) || !digital(y)) return
  if (y <= -0.5) active.add('up')
  if (y >= 0.5) active.add('down')
  if (x <= -0.5) active.add('left')
  if (x >= 0.5) active.add('right')
}

/**
 * Buttons and the left stick, for both the W3C standard mapping (Chrome/Edge
 * Xbox and DualShock/DualSense) and the raw Linux order those pads use when
 * the browser does not remap them.
 */
export function readRetroButtons(pad: PadSnapshot): Set<RetroPadButton> {
  const active = new Set<RetroPadButton>()
  const profile = padProfile(pad.id, pad.mapping)

  for (const [index, button] of FACE_BUTTONS) {
    if (buttonDown(pad, index)) active.add(button)
  }

  // Raw Xbox reports Back/Start at 6/7. Standard mapping and raw PlayStation
  // keep Share/Select and Options/Start at 8/9. Guide, stick-clicks, and the
  // DualSense touchpad stay unmapped so they cannot stick Select or Start.
  if (profile === 'xbox') {
    if (buttonDown(pad, 6)) active.add('select')
    if (buttonDown(pad, 7)) active.add('start')
  } else {
    if (buttonDown(pad, 8)) active.add('select')
    if (buttonDown(pad, 9)) active.add('start')
  }

  const hasDpadButtons = pad.buttons.length > 15
  if (profile !== 'xbox' || hasDpadButtons) {
    if (buttonDown(pad, 12)) active.add('up')
    if (buttonDown(pad, 13)) active.add('down')
    if (buttonDown(pad, 14)) active.add('left')
    if (buttonDown(pad, 15)) active.add('right')
  }

  if (pad.axes.length >= 2) addStick(active, pad.axes[0] ?? 0, pad.axes[1] ?? 0)

  // xpad exposes the D-pad as ABS_HAT0 at axes 6 and 7. On a standard mapping
  // those slots are not the hat (the right stick is axes 2 and 3).
  // One axis near rest means a hat cardinal (or a centered hat). Two axes pinned
  // at the rail is how Xbox triggers rest, and must not read as Up+Left.
  const hatOnAxes =
    (profile === 'xbox' || (profile !== 'standard' && !hasDpadButtons)) && pad.axes.length >= 8
  if (hatOnAxes) {
    const hatX = pad.axes[6] ?? 0
    const hatY = pad.axes[7] ?? 0
    if (Math.abs(hatX) <= 0.35 || Math.abs(hatY) <= 0.35) addHat(active, hatX, hatY)
  }

  return active
}

export type PadSlot = 'auto' | 'none' | number

export type PlayerSeat = 1 | 2 | 3 | 4 | 5

export interface ControllerBindings {
  pad1: PadSlot
  pad2: PadSlot
  pad3: PadSlot
  pad4: PadSlot
  pad5: PadSlot
}

export const DEFAULT_CONTROLLER_BINDINGS: ControllerBindings = {
  pad1: 'auto',
  pad2: 'auto',
  pad3: 'auto',
  pad4: 'none',
  pad5: 'none',
}

const STORAGE_KEY = 'retro-games-controllers-v1'

const PAD_KEYS = ['pad1', 'pad2', 'pad3', 'pad4', 'pad5'] as const

export function loadControllerBindings(): ControllerBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONTROLLER_BINDINGS }
    const parsed = JSON.parse(raw) as Partial<ControllerBindings>
    return {
      pad1: normalizeSlot(parsed.pad1, 'auto'),
      pad2: normalizeSlot(parsed.pad2, 'auto'),
      pad3: normalizeSlot(parsed.pad3, 'auto'),
      pad4: normalizeSlot(parsed.pad4, 'none'),
      pad5: normalizeSlot(parsed.pad5, 'none'),
    }
  } catch {
    return { ...DEFAULT_CONTROLLER_BINDINGS }
  }
}

export function saveControllerBindings(bindings: ControllerBindings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
}

function normalizeSlot(value: unknown, fallback: PadSlot): PadSlot {
  if (value === 'auto' || value === 'none') return value
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  return fallback
}

export function shortGamepadName(id: string): string {
  const cleaned = id.replace(/\s*\(.*\)\s*/g, '').trim()
  return cleaned.length > 36 ? `${cleaned.slice(0, 34)}…` : cleaned
}

export function padSlotForSeat(bindings: ControllerBindings, seat: PlayerSeat): PadSlot {
  return bindings[`pad${seat}`]
}

/**
 * Bind seats to connected gamepad indexes.
 * Explicit picks win. Auto then takes the lowest index that is still free,
 * so two seats never share one pad and a pinned pad is not also claimed by Auto.
 */
export function resolveSeatPads(
  bindings: ControllerBindings,
  seats: readonly PlayerSeat[],
  connectedIndices: readonly number[],
): Map<PlayerSeat, number | null> {
  const assigned = new Map<PlayerSeat, number | null>()
  const connected = new Set(connectedIndices)
  const used = new Set<number>()

  for (const seat of seats) {
    const slot = padSlotForSeat(bindings, seat)
    if (typeof slot !== 'number') continue
    if (connected.has(slot) && !used.has(slot)) {
      assigned.set(seat, slot)
      used.add(slot)
    } else {
      assigned.set(seat, null)
    }
  }

  const free = [...connectedIndices].filter((index) => !used.has(index)).sort((a, b) => a - b)
  let cursor = 0
  for (const seat of seats) {
    if (assigned.has(seat)) continue
    const slot = padSlotForSeat(bindings, seat)
    if (slot === 'none') {
      assigned.set(seat, null)
      continue
    }
    const index = free[cursor] ?? null
    assigned.set(seat, index)
    if (index !== null) cursor += 1
  }

  return assigned
}

/** Resolve which navigator gamepad index to poll for a logical seat. */
export function resolvePadIndex(
  slot: PadSlot,
  seat: PlayerSeat,
  connectedIndices: number[],
): number | null {
  const seats = activePlayerSeats(Math.max(seat, connectedIndices.length, 2))
  const bindings = { ...DEFAULT_CONTROLLER_BINDINGS }
  const key = `pad${seat}` as keyof ControllerBindings
  bindings[key] = slot
  return resolveSeatPads(bindings, seats, connectedIndices).get(seat) ?? null
}

export function activePlayerSeats(maxPlayers: number): PlayerSeat[] {
  const n = Math.min(5, Math.max(2, maxPlayers))
  return Array.from({ length: n }, (_, i) => (i + 1) as PlayerSeat)
}

export { PAD_KEYS }
