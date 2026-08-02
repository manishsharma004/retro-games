import type { RetroPadButton } from './keyboard'

/** W3C standard gamepad button index → RetroPad (Xbox layout → Nintendo faces). */
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

export const STICK_DEADZONE = 0.45

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

/** Resolve which navigator gamepad index to poll for a logical seat. */
export function resolvePadIndex(
  slot: PadSlot,
  seat: PlayerSeat,
  connectedIndices: number[],
): number | null {
  if (slot === 'none') return null
  if (typeof slot === 'number') {
    return connectedIndices.includes(slot) ? slot : null
  }
  const sorted = [...connectedIndices].sort((a, b) => a - b)
  return sorted[seat - 1] ?? null
}

export function activePlayerSeats(maxPlayers: number): PlayerSeat[] {
  const n = Math.min(5, Math.max(2, maxPlayers))
  return Array.from({ length: n }, (_, i) => (i + 1) as PlayerSeat)
}

export { PAD_KEYS }
