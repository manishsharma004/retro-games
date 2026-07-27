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
    select: { x: 50, y: 32, scale: 1 },
    start: { x: 50, y: 68, scale: 1 },
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

export function buttonsForZone(
  zoneId: VirtualLayoutZoneId,
  system: 'nes' | 'snes',
  dpadMode: 'dpad' | 'stick',
): VirtualLayoutButtonId[] {
  switch (zoneId) {
    case 'left':
      return dpadMode === 'stick' ? ['stick'] : DPAD_BUTTONS
    case 'meta':
      return ['select', 'start']
    case 'actions':
      return system === 'snes' ? SNES_ACTION_BUTTONS : NES_ACTION_BUTTONS
    case 'shoulders':
      return system === 'snes' ? ['l', 'r'] : []
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
  const { x, y, buttons } = zone as {
    x?: unknown
    y?: unknown
    buttons?: unknown
  }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }

  const next: VirtualLayoutZone = { x: clampPercent(x), y: clampPercent(y) }
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
  const defaults = DEFAULT_ZONE_BUTTONS[zoneId]
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

export function layoutUsesCustomButtons(layout: VirtualControlsLayout): boolean {
  const zones = resolveLayoutZones(layout)
  if (!zones) return false
  return Object.values(zones).some((zone) => zoneUsesCustomButtons(zone))
}

export function zoneStyle(zone: VirtualLayoutZone): { left: string; top: string } {
  return {
    left: `${zone.x}%`,
    top: `${zone.y}%`,
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
  return resolveZoneButtons(undefined, zoneId, system, dpadMode)
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
