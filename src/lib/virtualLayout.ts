export type VirtualLayoutZoneId = 'left' | 'meta' | 'actions' | 'shoulders'

export type VirtualLayoutButtonId =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'stick'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'l'
  | 'r'
  | 'start'
  | 'select'

export type VirtualLayoutPreset = 'default' | 'compact' | 'wide' | 'custom'

export interface VirtualLayoutButton {
  /** Horizontal position as % within the zone (0 = left edge). */
  x: number
  /** Vertical position as % within the zone (0 = top edge). */
  y: number
  /** Size multiplier on the default button dimensions (0.5–2). */
  scale: number
}

export interface VirtualLayoutZone {
  /** Horizontal position as % of the pad container (0 = left edge). */
  x: number
  /** Vertical position as % of the pad container (0 = top edge). */
  y: number
  /** Overall scale for the entire zone (0.5–2). */
  scale?: number
  buttons?: Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>>
}

export interface VirtualControlsLayout {
  preset: VirtualLayoutPreset
  zones: Partial<Record<VirtualLayoutZoneId, VirtualLayoutZone>>
}

export const LAYOUT_ZONE_LABELS: Record<VirtualLayoutZoneId, string> = {
  left: 'D-pad / Stick',
  meta: 'Start / Select',
  actions: 'Action buttons',
  shoulders: 'L / R',
}

export const BUTTON_LABELS: Record<VirtualLayoutButtonId, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  stick: 'Stick',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  l: 'L',
  r: 'R',
  start: 'Start',
  select: 'Select',
}

export const DEFAULT_LAYOUT: VirtualControlsLayout = {
  preset: 'default',
  zones: {},
}

const PRESET_ZONES: Record<Exclude<VirtualLayoutPreset, 'default' | 'custom'>, VirtualControlsLayout['zones']> = {
  compact: {
    left: { x: 14, y: 80 },
    actions: { x: 86, y: 80 },
    meta: { x: 50, y: 92 },
    shoulders: { x: 50, y: 6 },
  },
  wide: {
    left: { x: 10, y: 72 },
    actions: { x: 90, y: 72 },
    meta: { x: 50, y: 88 },
    shoulders: { x: 50, y: 8 },
  },
}

const DEFAULT_CUSTOM_ZONES: VirtualControlsLayout['zones'] = {
  left: { x: 16, y: 78 },
  actions: { x: 84, y: 78 },
  meta: { x: 50, y: 90 },
  shoulders: { x: 50, y: 10 },
}

const DEFAULT_ZONE_BUTTONS: Record<VirtualLayoutZoneId, Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>>> = {
  left: {
    up: { x: 50, y: 17, scale: 1 },
    left: { x: 17, y: 50, scale: 1 },
    right: { x: 83, y: 50, scale: 1 },
    down: { x: 50, y: 83, scale: 1 },
    stick: { x: 50, y: 50, scale: 1 },
  },
  meta: {
    select: { x: 50, y: 30, scale: 1 },
    start: { x: 50, y: 70, scale: 1 },
  },
  actions: {
    y: { x: 25, y: 25, scale: 1 },
    x: { x: 75, y: 25, scale: 1 },
    b: { x: 25, y: 75, scale: 1 },
    a: { x: 75, y: 75, scale: 1 },
  },
  shoulders: {
    l: { x: 25, y: 50, scale: 1 },
    r: { x: 75, y: 50, scale: 1 },
  },
}

const NES_ACTION_BUTTONS: VirtualLayoutButtonId[] = ['b', 'a']
const SNES_ACTION_BUTTONS: VirtualLayoutButtonId[] = ['y', 'x', 'b', 'a']
const DPAD_BUTTONS: VirtualLayoutButtonId[] = ['up', 'left', 'right', 'down']
const STICK_BUTTONS: VirtualLayoutButtonId[] = ['stick']
const META_BUTTONS: VirtualLayoutButtonId[] = ['select', 'start']
const SHOULDER_BUTTONS: VirtualLayoutButtonId[] = ['l', 'r']
const EMPTY_BUTTONS: VirtualLayoutButtonId[] = []

export function buttonsForZone(
  zoneId: VirtualLayoutZoneId,
  system: 'nes' | 'snes',
  dpadMode: 'dpad' | 'stick',
): VirtualLayoutButtonId[] {
  switch (zoneId) {
    case 'left':
      return dpadMode === 'stick' ? STICK_BUTTONS : DPAD_BUTTONS
    case 'meta':
      return META_BUTTONS
    case 'actions':
      return system === 'snes' ? SNES_ACTION_BUTTONS : NES_ACTION_BUTTONS
    case 'shoulders':
      return system === 'snes' ? SHOULDER_BUTTONS : EMPTY_BUTTONS
  }
}

export function getEditableZones(layout: VirtualControlsLayout): VirtualControlsLayout['zones'] {
  return resolveLayoutZones(layout) ?? { ...DEFAULT_CUSTOM_ZONES }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function clampScale(value: number): number {
  return Math.min(2, Math.max(0.5, Math.round(value * 100) / 100))
}

function sanitizeButton(button: unknown): VirtualLayoutButton | undefined {
  if (!button || typeof button !== 'object') return undefined
  const { x, y, scale } = button as { x?: unknown; y?: unknown; scale?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }
  const nextScale = typeof scale === 'number' && Number.isFinite(scale) ? scale : 1
  return { x: clampPercent(x), y: clampPercent(y), scale: clampScale(nextScale) }
}

function sanitizeZone(zone: unknown): VirtualLayoutZone | undefined {
  if (!zone || typeof zone !== 'object') return undefined
  const { x, y, scale, buttons } = zone as {
    x?: unknown
    y?: unknown
    scale?: unknown
    buttons?: unknown
  }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }

  const next: VirtualLayoutZone = { x: clampPercent(x), y: clampPercent(y) }
  if (typeof scale === 'number' && Number.isFinite(scale)) {
    next.scale = clampScale(scale)
  }
  if (buttons && typeof buttons === 'object') {
    const sanitizedButtons: Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>> = {}
    for (const [id, value] of Object.entries(buttons)) {
      const button = sanitizeButton(value)
      if (button) sanitizedButtons[id as VirtualLayoutButtonId] = button
    }
    if (Object.keys(sanitizedButtons).length > 0) {
      next.buttons = sanitizedButtons
    }
  }
  return next
}

export function sanitizeLayout(raw: unknown): VirtualControlsLayout {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LAYOUT }
  const { preset, zones } = raw as { preset?: unknown; zones?: unknown }
  const validPresets: VirtualLayoutPreset[] = ['default', 'compact', 'wide', 'custom']
  const nextPreset = validPresets.includes(preset as VirtualLayoutPreset)
    ? (preset as VirtualLayoutPreset)
    : 'default'

  if (nextPreset === 'default') {
    return { preset: 'default', zones: {} }
  }

  const sourceZones =
    nextPreset === 'custom'
      ? (zones as VirtualControlsLayout['zones'] | undefined)
      : PRESET_ZONES[nextPreset]

  const sanitized: VirtualControlsLayout['zones'] = {}
  for (const id of Object.keys(DEFAULT_CUSTOM_ZONES) as VirtualLayoutZoneId[]) {
    const zone = sanitizeZone(sourceZones?.[id]) ?? DEFAULT_CUSTOM_ZONES[id]
    if (zone) sanitized[id] = zone
  }

  return { preset: nextPreset, zones: sanitized }
}

export function resolveLayoutZones(layout: VirtualControlsLayout): VirtualControlsLayout['zones'] | null {
  if (layout.preset === 'default') return null
  if (layout.preset === 'custom') {
    return sanitizeLayout(layout).zones
  }
  return PRESET_ZONES[layout.preset]
}

export function resolveZoneButtons(
  zone: VirtualLayoutZone | undefined,
  zoneId: VirtualLayoutZoneId,
  system: 'nes' | 'snes',
  dpadMode: 'dpad' | 'stick',
): Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>> {
  const defaults = defaultButtonsForZone(zoneId, system, dpadMode)
  const activeIds = buttonsForZone(zoneId, system, dpadMode)
  const resolved: Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>> = {}

  for (const id of activeIds) {
    const custom = zone?.buttons?.[id]
    const fallback = defaults[id]
    if (custom) {
      resolved[id] = custom
    } else if (fallback) {
      resolved[id] = { ...fallback }
    }
  }

  return resolved
}

export function zoneUsesCustomButtons(zone: VirtualLayoutZone | undefined): boolean {
  return Boolean(zone?.buttons && Object.keys(zone.buttons).length > 0)
}

export function layoutUsesCustomPositions(layout: VirtualControlsLayout): boolean {
  return layout.preset !== 'default'
}

export function zoneStyle(zone: VirtualLayoutZone): { left: string; top: string; transform: string } {
  const scale = zone.scale ?? 1
  return {
    left: `${zone.x}%`,
    top: `${zone.y}%`,
    transform: `translate(-50%, -50%) scale(${scale})`,
  }
}

export function buttonStyle(button: VirtualLayoutButton): {
  left: string
  top: string
  transform: string
  '--btn-scale': number
} {
  return {
    left: `${button.x}%`,
    top: `${button.y}%`,
    transform: 'translate(-50%, -50%)',
    '--btn-scale': button.scale,
  }
}

export function presetLayout(preset: Exclude<VirtualLayoutPreset, 'default' | 'custom'>): VirtualControlsLayout {
  return {
    preset,
    zones: { ...PRESET_ZONES[preset] },
  }
}

export function customLayoutFromZones(zones: VirtualControlsLayout['zones']): VirtualControlsLayout {
  return sanitizeLayout({ preset: 'custom', zones })
}

export function defaultButtonsForZone(
  zoneId: VirtualLayoutZoneId,
  system: 'nes' | 'snes',
  dpadMode: 'dpad' | 'stick',
): Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>> {
  const defaults = DEFAULT_ZONE_BUTTONS[zoneId]
  const activeIds = buttonsForZone(zoneId, system, dpadMode)
  const resolved: Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>> = {}

  for (const id of activeIds) {
    const fallback = defaults[id]
    if (fallback) resolved[id] = { ...fallback }
  }

  // NES actions are a single row (B left, A right), not the SNES 2×2 grid.
  if (zoneId === 'actions' && system === 'nes') {
    resolved.b = { x: 30, y: 50, scale: 1 }
    resolved.a = { x: 70, y: 50, scale: 1 }
  }

  return resolved
}

export function mergeZoneButtons(
  zone: VirtualLayoutZone | undefined,
  zoneId: VirtualLayoutZoneId,
  system: 'nes' | 'snes',
  dpadMode: 'dpad' | 'stick',
  updates: Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>>,
): Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>> {
  const current = resolveZoneButtons(zone, zoneId, system, dpadMode)
  return { ...current, ...updates }
}

export function ensureAllZoneButtons(
  zones: VirtualControlsLayout['zones'],
  system: 'nes' | 'snes',
  dpadMode: 'dpad' | 'stick',
): VirtualControlsLayout['zones'] {
  let next = { ...zones }
  for (const zoneId of Object.keys(DEFAULT_CUSTOM_ZONES) as VirtualLayoutZoneId[]) {
    if (buttonsForZone(zoneId, system, dpadMode).length === 0) continue
    const zone = next[zoneId] ?? DEFAULT_CUSTOM_ZONES[zoneId]!
    if (!zoneUsesCustomButtons(zone)) {
      next = {
        ...next,
        [zoneId]: {
          ...zone,
          buttons: defaultButtonsForZone(zoneId, system, dpadMode),
        },
      }
    }
  }
  return next
}

export function resetZoneButtons(
  zoneId: VirtualLayoutZoneId,
  system: 'nes' | 'snes',
  dpadMode: 'dpad' | 'stick',
): Partial<Record<VirtualLayoutButtonId, VirtualLayoutButton>> {
  return defaultButtonsForZone(zoneId, system, dpadMode)
}

export function resolveZoneScale(zone: VirtualLayoutZone | undefined): number {
  return zone?.scale ?? 1
}
