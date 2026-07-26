import type { RetroPadButton } from './keyboard'

/** W3C standard gamepad button index → RetroPad (Xbox layout → Nintendo faces). */
export const STANDARD_BUTTON_MAP: Partial<Record<number, RetroPadButton>> = {
  0: 'b', // south (Xbox A) → NES/SNES B
  1: 'a', // east (Xbox B) → NES/SNES A
  2: 'y', // west (Xbox X) → SNES Y
  3: 'x', // north (Xbox Y) → SNES X
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

export interface ControllerBindings {
  /** Gamepad for local player 1 (or peer local seat when linked). */
  pad1: PadSlot
  /** Gamepad for local player 2 (couch co-op on one device; unused in peer mode). */
  pad2: PadSlot
}

export const DEFAULT_CONTROLLER_BINDINGS: ControllerBindings = {
  pad1: 'auto',
  pad2: 'auto',
}

const STORAGE_KEY = 'retro-games-controllers-v1'

export function loadControllerBindings(): ControllerBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONTROLLER_BINDINGS }
    const parsed = JSON.parse(raw) as Partial<ControllerBindings>
    return {
      pad1: normalizeSlot(parsed.pad1, 'auto'),
      pad2: normalizeSlot(parsed.pad2, 'auto'),
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

/** Resolve which navigator gamepad index to poll for a logical seat. */
export function resolvePadIndex(
  slot: PadSlot,
  seat: 1 | 2,
  connectedIndices: number[],
): number | null {
  if (slot === 'none') return null
  if (typeof slot === 'number') {
    return connectedIndices.includes(slot) ? slot : null
  }
  // auto: seat 1 → first pad, seat 2 → second pad (if any)
  const sorted = [...connectedIndices].sort((a, b) => a - b)
  if (seat === 1) return sorted[0] ?? null
  return sorted[1] ?? null
}
