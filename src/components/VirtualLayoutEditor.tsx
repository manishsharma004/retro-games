import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { SystemId } from '../lib/cores'
import {
  BUTTON_LABELS,
  buttonsForZone,
  customLayoutFromZones,
  ensureAllZoneButtons,
  getEditableZones,
  LAYOUT_ZONE_LABELS,
  mergeZoneButtons,
  resetZoneButtons,
  resolveZoneButtons,
  resolveZoneScale,
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
const DRAG_THRESHOLD_PX = 6

function pointerToPercent(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
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
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)

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

  const selectedZoneData = ensureZone(draftZones, selectedZone)
  const selectedButtonLayout = selectedButton
    ? resolveZoneButtons(selectedZoneData, selectedZone, system, dpadMode)[selectedButton]
    : undefined

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
          return a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
        }) && activeZoneButtons.length === Object.keys(next).length
      return same ? prev : next
    })
  }, [open, editMode, selectedZone, activeZoneButtons, draftZones])

  const updateZone = useCallback((zoneId: VirtualLayoutZoneId, patch: Partial<VirtualLayoutZone>) => {
    setDraftZones((prev) => ({
      ...prev,
      [zoneId]: { ...ensureZone(prev, zoneId), ...patch },
    }))
  }, [])

  const updateZoneButtons = useCallback(
    (
      zoneId: VirtualLayoutZoneId,
      buttonId: VirtualLayoutButtonId,
      patch: Partial<VirtualLayoutButton>,
    ) => {
      setDraftZones((prev) => {
        const zone = ensureZone(prev, zoneId)
        const buttons = mergeZoneButtons(zone, zoneId, system, dpadMode, {
          [buttonId]: {
            ...resolveZoneButtons(zone, zoneId, system, dpadMode)[buttonId]!,
            ...patch,
          },
        })
        return {
          ...prev,
          [zoneId]: { ...zone, buttons },
        }
      })
    },
    [dpadMode, system],
  )

  const selectZone = useCallback(
    (zoneId: VirtualLayoutZoneId) => {
      setSelectedZone(zoneId)
      const buttons = buttonsForZone(zoneId, system, dpadMode)
      setSelectedButton(buttons[0] ?? null)
      setDraftZones((prev) => {
        const zone = ensureZone(prev, zoneId)
        if (zoneUsesCustomButtons(zone)) return prev
        return {
          ...prev,
          [zoneId]: { ...zone, buttons: resetZoneButtons(zoneId, system, dpadMode) },
        }
      })
    },
    [dpadMode, system],
  )

  const enterButtonsMode = useCallback(() => {
    setEditMode('buttons')
    setDraftZones((prev) => ensureAllZoneButtons(prev, system, dpadMode))
    const firstButtons = buttonsForZone(selectedZone, system, dpadMode)
    setSelectedButton(firstButtons[0] ?? null)
  }, [dpadMode, selectedZone, system])

  const startZoneDrag = useCallback((zoneId: VirtualLayoutZoneId, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    dragZoneRef.current = zoneId
    draggingRef.current = false
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const moveZoneDrag = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const zoneId = dragZoneRef.current
    const container = containerRef.current
    const origin = dragOriginRef.current
    if (!zoneId || !container || !origin) return
    e.preventDefault()
    const dx = e.clientX - origin.x
    const dy = e.clientY - origin.y
    if (!draggingRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    draggingRef.current = true
    const next = pointerToPercent(container, e.clientX, e.clientY)
    updateZone(zoneId, next)
  }, [updateZone])

  const startButtonDrag = useCallback(
    (zoneId: VirtualLayoutZoneId, buttonId: VirtualLayoutButtonId, e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const stage = containerRef.current
      const zoneEl = stage?.querySelector(`[data-layout-zone="${zoneId}"]`)
      if (!zoneEl) return
      dragButtonRef.current = { zoneId, buttonId }
      draggingRef.current = false
      dragOriginRef.current = { x: e.clientX, y: e.clientY }
      setSelectedButton(buttonId)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [],
  )

  const moveButtonDrag = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const drag = dragButtonRef.current
      const stage = containerRef.current
      const origin = dragOriginRef.current
      if (!drag || !stage || !origin) return
      e.preventDefault()
      const dx = e.clientX - origin.x
      const dy = e.clientY - origin.y
      if (!draggingRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      draggingRef.current = true
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
    dragOriginRef.current = null
    draggingRef.current = false
  }, [])

  const handleSave = () => {
    onSave(customLayoutFromZones(draftZones))
  }

  if (!open) return null

  const showShoulders = system === 'snes'
  const visibleZones = ZONE_ORDER.filter((id) => id !== 'shoulders' || showShoulders)
  const visibleButtonZones = visibleZones.filter((id) => buttonsForZone(id, system, dpadMode).length > 0)
  const zoneScale = resolveZoneScale(selectedZoneData)

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
            onClick={enterButtonsMode}
          >
            Buttons
          </button>
        </div>

        {editMode === 'buttons' && (
          <>
            <div className="layout-editor__zone-tabs" role="tablist" aria-label="Button group">
              {visibleButtonZones.map((zoneId) => (
                <button
                  key={zoneId}
                  type="button"
                  role="tab"
                  aria-selected={selectedZone === zoneId}
                  className={`btn ${selectedZone === zoneId ? 'btn--ghost' : 'btn--text'}`}
                  onClick={() => selectZone(zoneId)}
                >
                  {LAYOUT_ZONE_LABELS[zoneId]}
                </button>
              ))}
            </div>

            <div className="layout-editor__button-picks">
              {activeZoneButtons.map((buttonId) => (
                <button
                  key={buttonId}
                  type="button"
                  className={`btn btn--ghost layout-editor__button-pick${selectedButton === buttonId ? ' layout-editor__button-pick--selected' : ''}`}
                  onClick={() => setSelectedButton(buttonId)}
                >
                  {BUTTON_LABELS[buttonId]}
                </button>
              ))}
            </div>

            <label className="layout-editor__scale">
              <span>Group size</span>
              <input
                type="range"
                min={50}
                max={200}
                step={5}
                value={Math.round(zoneScale * 100)}
                onChange={(e) => updateZone(selectedZone, { scale: Number(e.target.value) / 100 })}
              />
              <em>{Math.round(zoneScale * 100)}%</em>
            </label>

            {selectedButton && selectedButtonLayout && (
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

            <button
              type="button"
              className="btn btn--text"
              onClick={() =>
                updateZone(selectedZone, {
                  buttons: resetZoneButtons(selectedZone, system, dpadMode),
                })
              }
            >
              Reset {LAYOUT_ZONE_LABELS[selectedZone]} alignment
            </button>
          </>
        )}

        <p className="layout-editor__hint">
          {editMode === 'zones'
            ? 'Drag each zone to reposition control groups.'
            : 'Drag the group or individual buttons. Use the pickers and sliders to adjust sizes.'}
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

        {editMode === 'buttons' && (
          <>
            {draftZones[selectedZone] && (
              <button
                type="button"
                className="layout-editor__handle layout-editor__handle--zone"
                style={{ left: `${draftZones[selectedZone]!.x}%`, top: `${draftZones[selectedZone]!.y}%` }}
                aria-label={`Drag ${LAYOUT_ZONE_LABELS[selectedZone]} group`}
                onPointerDown={(e) => startZoneDrag(selectedZone, e)}
                onPointerMove={moveZoneDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span className="layout-editor__handle-label">{LAYOUT_ZONE_LABELS[selectedZone]}</span>
              </button>
            )}

            {activeZoneButtons.map((buttonId) => {
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
                >
                  <span className="layout-editor__handle-label">{BUTTON_LABELS[buttonId]}</span>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
