import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { SystemId } from '../lib/cores'
import {
  customLayoutFromZones,
  getEditableZones,
  LAYOUT_ZONE_LABELS,
  type VirtualControlsLayout,
  type VirtualLayoutZoneId,
} from '../lib/virtualLayout'
import { VirtualController } from './VirtualController'

interface VirtualLayoutEditorProps {
  open: boolean
  system: SystemId
  layout: VirtualControlsLayout
  dpadMode: 'dpad' | 'stick'
  size: 'small' | 'medium' | 'large'
  opacity: number
  onSave: (layout: VirtualControlsLayout) => void
  onCancel: () => void
}

const ZONE_ORDER: VirtualLayoutZoneId[] = ['left', 'actions', 'meta', 'shoulders']

function pointerToPercent(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return {
    x: Math.min(100, Math.max(0, Math.round(x))),
    y: Math.min(100, Math.max(0, Math.round(y))),
  }
}

export function VirtualLayoutEditor({
  open,
  system,
  layout,
  dpadMode,
  size,
  opacity,
  onSave,
  onCancel,
}: VirtualLayoutEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragZoneRef = useRef<VirtualLayoutZoneId | null>(null)
  const [draftZones, setDraftZones] = useState(() => getEditableZones(layout))

  useEffect(() => {
    if (!open) return
    setDraftZones(getEditableZones(layout))
  }, [open, layout])

  const previewLayout = customLayoutFromZones(draftZones)

  const startDrag = useCallback((zoneId: VirtualLayoutZoneId, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    dragZoneRef.current = zoneId
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    const next = pointerToPercent(container, e.clientX, e.clientY)
    setDraftZones((prev) => ({ ...prev, [zoneId]: next }))
  }, [])

  const moveDrag = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const zoneId = dragZoneRef.current
    const container = containerRef.current
    if (!zoneId || !container) return
    e.preventDefault()
    const next = pointerToPercent(container, e.clientX, e.clientY)
    setDraftZones((prev) => ({ ...prev, [zoneId]: next }))
  }, [])

  const endDrag = useCallback(() => {
    dragZoneRef.current = null
  }, [])

  const handleSave = () => {
    onSave(customLayoutFromZones(draftZones))
  }

  if (!open) return null

  const showShoulders = system === 'snes'
  const visibleZones = ZONE_ORDER.filter((id) => id !== 'shoulders' || showShoulders)

  return (
    <div className="layout-editor" role="dialog" aria-label="Edit virtual controller layout">
      <div className="layout-editor__toolbar">
        <p className="layout-editor__hint">Drag each zone to reposition. Positions are saved per device.</p>
        <div className="layout-editor__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            Save layout
          </button>
        </div>
      </div>

      <div className="layout-editor__stage" ref={containerRef}>
        <VirtualController
          system={system}
          onPress={() => {}}
          onRelease={() => {}}
          visible
          dpadMode={dpadMode}
          overlay
          size={size}
          opacity={Math.max(opacity, 0.65)}
          layout={previewLayout}
          editing
        />

        {visibleZones.map((zoneId) => {
          const zone = draftZones[zoneId]
          if (!zone) return null
          return (
            <button
              key={zoneId}
              type="button"
              className="layout-editor__handle"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
              }}
              aria-label={`Drag ${LAYOUT_ZONE_LABELS[zoneId]}`}
              onPointerDown={(e) => startDrag(zoneId, e)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className="layout-editor__handle-label">{LAYOUT_ZONE_LABELS[zoneId]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
