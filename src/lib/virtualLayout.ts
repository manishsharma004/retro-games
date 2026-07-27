export type VirtualLayoutZoneId = 'left' | 'meta' | 'actions' | 'shoulders'

export type VirtualLayoutPreset = 'default' | 'compact' | 'wide' | 'custom'

export interface VirtualLayoutZone {
  /** Horizontal position as % of the pad container (0 = left edge). */
  x: number
  /** Vertical position as % of the pad container (0 = top edge). */
  y: number
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

export function getEditableZones(layout: VirtualControlsLayout): VirtualControlsLayout['zones'] {
  return resolveLayoutZones(layout) ?? { ...DEFAULT_CUSTOM_ZONES }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function sanitizeZone(zone: unknown): VirtualLayoutZone | undefined {
  if (!zone || typeof zone !== 'object') return undefined
  const { x, y } = zone as { x?: unknown; y?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }
  return { x: clampPercent(x), y: clampPercent(y) }
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

export function layoutUsesCustomPositions(layout: VirtualControlsLayout): boolean {
  return layout.preset !== 'default'
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
