import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { SystemId } from '../lib/cores'
import {
  BUTTON_LABELS,
  buttonsForZone,
  customLayoutFromZones,
  defaultButtonsForZone,
  getEditableZones,
  LAYOUT_ZONE_LABELS,
  mergeZoneButtons,
  resolveZoneButtons,
  zoneUsesCustomButtons,
  type VirtualControlsLayout,
  type VirtualLayoutButton,
  type VirtualLayoutButtonId,
  type VirtualLayoutZone,
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

type EditMode = 'zones' | 'buttons'

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

function ensureZone(
  zones: VirtualControlsLayout['zones'],
  zoneId: VirtualLayoutZoneId,
): VirtualLayoutZone {
  return zones[zoneId] ?? getEditableZones({ preset: 'custom', zones })[zoneId]!
}

function ensureZoneButtons(
  zones: VirtualControlsLayout['zones'],
  zoneId: VirtualLayoutZoneId,
  system: SystemId,
  dpadMode: 'dpad' | 'stick',
): VirtualControlsLayout['zones'] {
  const zone = ensureZone(zones, zoneId)
  if (zoneUsesCustomButtons(zone)) return zones
  return {
    ...zones,
    [zoneId]: {
      ...zone,
      buttons: defaultButtonsForZone(zoneId, system, dpadMode),
    },
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
  const dragButtonRef = useRef<{ zoneId: VirtualLayoutZoneId; buttonId: VirtualLayoutButtonId } | null>(
    null,
  )
  const [editMode, setEditMode] = useState<EditMode>('zones')
  const [selectedZone, setSelectedZone] = useState<VirtualLayoutZoneId>('left')
  const [selectedButton, setSelectedButton] = useState<VirtualLayoutButtonId | null>(null)
  const [draftZones, setDraftZones] = useState(() => getEditableZones(layout))
  const [buttonHandlePositions, setButtonHandlePositions] = useState<
    Partial<Record<VirtualLayoutButtonId, { x: number; y: number }>>
  >({})

  useEffect(() => {
    if (!open) return
    setDraftZones(getEditableZones(layout))
    setEditMode('zones')
    setSelectedZone('left')
    setSelectedButton(null)
  }, [open, layout])

  const previewLayout = customLayoutFromZones(draftZones)
  const activeZoneButtons = useMemo(
    () => buttonsForZone(selectedZone, system, dpadMode),
    [selectedZone, system, dpadMode],
  )

  useLayoutEffect(() => {
    if (!open || editMode !== 'buttons') return
    const stage = containerRef.current
    if (!stage) return
    const zoneEl = stage.querySelector(`[data-layout-zone="${selectedZone}"]`)
    if (!zoneEl) return
    const stageRect = stage.getBoundingClientRect()
    if (stageRect.width <= 0 || stageRect.height <= 0) return
    const next: Partial<Record<VirtualLayoutButtonId, { x: number; y: number }>> = {}

    for (const buttonId of activeZoneButtons) {
      const buttonEl = zoneEl.querySelector(`[data-layout-button="${buttonId}"]`)
      if (!buttonEl) continue
      const rect = buttonEl.getBoundingClientRect()
      next[buttonId] = {
        x: ((rect.left + rect.width / 2 - stageRect.left) / stageRect.width) * 100,
        y: ((rect.top + rect.height / 2 - stageRect.top) / stageRect.height) * 100,
      }
    }

    setButtonHandlePositions((prev) => {
      const same =
        activeZoneButtons.every((id) => {
          const a = prev[id]
          const b = next[id]
          return a && b && a.x === b.x && a.y === b.y
        }) && activeZoneButtons.length === Object.keys(next).length
      return same ? prev : next
    })
  }, [open, editMode, selectedZone, activeZoneButtons, draftZones])

  const updateZoneButtons = useCallback(
    (
      zoneId: VirtualLayoutZoneId,
      buttonId: VirtualLayoutButtonId,
      patch: Partial<VirtualLayoutButton>,
    ) => {
      setDraftZones((prev) => {
        const withButtons = ensureZoneButtons(prev, zoneId, system, dpadMode)
        const zone = ensureZone(withButtons, zoneId)
        const buttons = mergeZoneButtons(zone, zoneId, system, dpadMode, {
          [buttonId]: {
            ...resolveZoneButtons(zone, zoneId, system, dpadMode)[buttonId]!,
            ...patch,
          },
        })
        return {
          ...withButtons,
          [zoneId]: { ...zone, buttons },
        }
      })
    },
    [dpadMode, system],
  )

  const startZoneDrag = useCallback((zoneId: VirtualLayoutZoneId, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    dragZoneRef.current = zoneId
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const next = pointerToPercent(container, e.clientX, e.clientY)
    setDraftZones((prev) => ({ ...prev, [zoneId]: { ...ensureZone(prev, zoneId), ...next } }))
  }, [])

  const moveZoneDrag = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const zoneId = dragZoneRef.current
    const container = containerRef.current
    if (!zoneId || !container) return
    e.preventDefault()
    const next = pointerToPercent(container, e.clientX, e.clientY)
    setDraftZones((prev) => ({ ...prev, [zoneId]: { ...ensureZone(prev, zoneId), ...next } }))
  }, [])

  const startButtonDrag = useCallback(
    (zoneId: VirtualLayoutZoneId, buttonId: VirtualLayoutButtonId, e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const stage = containerRef.current
      const zoneEl = stage?.querySelector(`[data-layout-zone="${zoneId}"]`)
      if (!zoneEl) return
      dragButtonRef.current = { zoneId, buttonId }
      setSelectedButton(buttonId)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      setDraftZones((prev) => ensureZoneButtons(prev, zoneId, system, dpadMode))
      const next = pointerToPercent(zoneEl as HTMLElement, e.clientX, e.clientY)
      updateZoneButtons(zoneId, buttonId, next)
    },
    [dpadMode, system, updateZoneButtons],
  )

  const moveButtonDrag = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const drag = dragButtonRef.current
      const stage = containerRef.current
      if (!drag || !stage) return
      e.preventDefault()
      const zoneEl = stage.querySelector(`[data-layout-zone="${drag.zoneId}"]`)
      if (!zoneEl) return
      const next = pointerToPercent(zoneEl as HTMLElement, e.clientX, e.clientY)
      updateZoneButtons(drag.zoneId, drag.buttonId, next)
    },
    [updateZoneButtons],
  )

  const endDrag = useCallback(() => {
    dragZoneRef.current = null
    dragButtonRef.current = null
  }, [])

  const handleSave = () => {
    onSave(customLayoutFromZones(draftZones))
  }

  const selectedButtonLayout =
    selectedButton && editMode === 'buttons'
      ? resolveZoneButtons(ensureZone(draftZones, selectedZone), selectedZone, system, dpadMode)[
          selectedButton
        ]
      : undefined

  if (!open) return null

  const showShoulders = system === 'snes'
  const visibleZones = ZONE_ORDER.filter((id) => id !== 'shoulders' || showShoulders)
  const visibleButtonZones = visibleZones.filter((id) => buttonsForZone(id, system, dpadMode).length > 0)

  return (
    <div className="layout-editor" role="dialog" aria-label="Edit virtual controller layout">
      <div className="layout-editor__toolbar">
        <div className="layout-editor__modes" role="tablist" aria-label="Layout edit mode">
          <button
            type="button"
            role="tab"
            aria-selected={editMode === 'zones'}
            className={`btn ${editMode === 'zones' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setEditMode('zones')}
          >
            Zones
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={editMode === 'buttons'}
            className={`btn ${editMode === 'buttons' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => {
              setEditMode('buttons')
              setDraftZones((prev) => ensureZoneButtons(prev, selectedZone, system, dpadMode))
            }}
          >
            Buttons
          </button>
        </div>

        {editMode === 'buttons' && (
          <div className="layout-editor__zone-tabs" role="tablist" aria-label="Button group">
            {visibleButtonZones.map((zoneId) => (
              <button
                key={zoneId}
                type="button"
                role="tab"
                aria-selected={selectedZone === zoneId}
                className={`btn ${selectedZone === zoneId ? 'btn--ghost' : 'btn--text'}`}
                onClick={() => {
                  setSelectedZone(zoneId)
                  setSelectedButton(null)
                  setDraftZones((prev) => ensureZoneButtons(prev, zoneId, system, dpadMode))
                }}
              >
                {LAYOUT_ZONE_LABELS[zoneId]}
              </button>
            ))}
          </div>
        )}

        {editMode === 'buttons' && selectedButton && selectedButtonLayout && (
          <label className="layout-editor__scale">
            <span>{BUTTON_LABELS[selectedButton]} size</span>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={Math.round(selectedButtonLayout.scale * 100)}
              onChange={(e) =>
                updateZoneButtons(selectedZone, selectedButton, {
                  scale: Number(e.target.value) / 100,
                })
              }
            />
            <em>{Math.round(selectedButtonLayout.scale * 100)}%</em>
          </label>
        )}

        <p className="layout-editor__hint">
          {editMode === 'zones'
            ? 'Drag each zone to reposition control groups.'
            : 'Select a group, then drag buttons or adjust size with the slider.'}
        </p>

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

        {editMode === 'zones' &&
          visibleZones.map((zoneId) => {
            const zone = draftZones[zoneId]
            if (!zone) return null
            return (
              <button
                key={zoneId}
                type="button"
                className="layout-editor__handle"
                style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                aria-label={`Drag ${LAYOUT_ZONE_LABELS[zoneId]}`}
                onPointerDown={(e) => startZoneDrag(zoneId, e)}
                onPointerMove={moveZoneDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span className="layout-editor__handle-label">{LAYOUT_ZONE_LABELS[zoneId]}</span>
              </button>
            )
          })}

        {editMode === 'buttons' &&
          activeZoneButtons.map((buttonId) => {
            const pos = buttonHandlePositions[buttonId]
            if (!pos) return null
            return (
              <button
                key={buttonId}
                type="button"
                className={`layout-editor__handle layout-editor__handle--button${selectedButton === buttonId ? ' layout-editor__handle--selected' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                aria-label={`Drag ${BUTTON_LABELS[buttonId]}`}
                onPointerDown={(e) => startButtonDrag(selectedZone, buttonId, e)}
                onPointerMove={moveButtonDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClick={() => {
                  setSelectedButton(buttonId)
                  setDraftZones((prev) => ensureZoneButtons(prev, selectedZone, system, dpadMode))
                }}
              >
                <span className="layout-editor__handle-label">{BUTTON_LABELS[buttonId]}</span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
