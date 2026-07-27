import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { SystemId } from '../lib/cores'
import {
  BUTTON_LABELS,
  buttonsForZone,
  customLayoutFromZones,
  DEFAULT_LAYOUT,
  ensureAllZoneButtons,
  getEditableZones,
  LAYOUT_ZONE_LABELS,
  mergeZoneButtons,
  presetLayout,
  resetZoneButtons,
  resolveZoneButtons,
  resolveZoneScale,
  type VirtualControlsLayout,
  type VirtualLayoutButton,
  type VirtualLayoutButtonId,
  type VirtualLayoutPreset,
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
  gameName?: string
  gamepadName?: string | null
  onSave: (layout: VirtualControlsLayout, options?: { opacity?: number }) => void
  onCancel: () => void
  onOpenSettings?: () => void
  onOpenControllers?: () => void
}

type ElementKind = 'zone' | 'button'

interface EditorElement {
  id: string
  kind: ElementKind
  zoneId: VirtualLayoutZoneId
  buttonId?: VirtualLayoutButtonId
  label: string
  icon: string
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

type DragMode =
  | { type: 'move-zone'; zoneId: VirtualLayoutZoneId }
  | { type: 'move-button'; zoneId: VirtualLayoutZoneId; buttonId: VirtualLayoutButtonId }
  | { type: 'resize-zone'; zoneId: VirtualLayoutZoneId; startScale: number; startDist: number }
  | {
      type: 'resize-button'
      zoneId: VirtualLayoutZoneId
      buttonId: VirtualLayoutButtonId
      startScale: number
      startDist: number
    }

const ZONE_ORDER: VirtualLayoutZoneId[] = ['left', 'actions', 'meta', 'shoulders']
const DRAG_THRESHOLD_PX = 5
const SNAP_STEP = 5

function clampScale(value: number): number {
  return Math.min(2, Math.max(0.5, Math.round(value * 100) / 100))
}

function elementId(zoneId: VirtualLayoutZoneId, buttonId?: VirtualLayoutButtonId): string {
  return buttonId ? `button:${zoneId}:${buttonId}` : `zone:${zoneId}`
}

function pointerToPercent(
  container: HTMLElement,
  clientX: number,
  clientY: number,
  snap: boolean,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  let x = ((clientX - rect.left) / rect.width) * 100
  let y = ((clientY - rect.top) / rect.height) * 100
  if (snap) {
    x = Math.round(x / SNAP_STEP) * SNAP_STEP
    y = Math.round(y / SNAP_STEP) * SNAP_STEP
  }
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

function buildElements(system: SystemId, dpadMode: 'dpad' | 'stick'): EditorElement[] {
  const items: EditorElement[] = []
  const showShoulders = system === 'snes'

  items.push({
    id: elementId('left'),
    kind: 'zone',
    zoneId: 'left',
    label: dpadMode === 'stick' ? 'Stick' : 'D-pad',
    icon: dpadMode === 'stick' ? '◎' : '✥',
  })

  if (dpadMode === 'dpad') {
    for (const buttonId of buttonsForZone('left', system, dpadMode)) {
      items.push({
        id: elementId('left', buttonId),
        kind: 'button',
        zoneId: 'left',
        buttonId,
        label: BUTTON_LABELS[buttonId],
        icon: '•',
      })
    }
  }

  for (const zoneId of ['actions', 'meta', 'shoulders'] as VirtualLayoutZoneId[]) {
    if (zoneId === 'shoulders' && !showShoulders) continue
    const buttons = buttonsForZone(zoneId, system, dpadMode)
    if (buttons.length === 0) continue

    if (zoneId === 'meta') {
      for (const buttonId of buttons) {
        items.push({
          id: elementId(zoneId, buttonId),
          kind: 'button',
          zoneId,
          buttonId,
          label: buttonId === 'select' ? 'Select' : 'Start',
          icon: 'T',
        })
      }
      continue
    }

    for (const buttonId of buttons) {
      items.push({
        id: elementId(zoneId, buttonId),
        kind: 'button',
        zoneId,
        buttonId,
        label: zoneId === 'actions' ? `Buttons (${BUTTON_LABELS[buttonId]})` : BUTTON_LABELS[buttonId],
        icon: BUTTON_LABELS[buttonId],
      })
    }
  }

  return items
}

export function VirtualLayoutEditor({
  open,
  system,
  layout,
  dpadMode,
  size,
  opacity,
  gameName,
  gamepadName,
  onSave,
  onCancel,
  onOpenSettings,
  onOpenControllers,
}: VirtualLayoutEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode | null>(null)
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)

  const [draftZones, setDraftZones] = useState(() => getEditableZones(layout))
  const [selectedId, setSelectedId] = useState('zone:left')
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const [globalScale, setGlobalScale] = useState(100)
  const [globalOpacity, setGlobalOpacity] = useState(Math.round(opacity * 100))
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<{ x: number; y: number } | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)

  const elements = useMemo(() => buildElements(system, dpadMode), [system, dpadMode])
  const selected = useMemo(() => elements.find((el) => el.id === selectedId) ?? elements[0], [elements, selectedId])
  const previewLayout = customLayoutFromZones(draftZones)

  useEffect(() => {
    if (!open) return
    setDraftZones(ensureAllZoneButtons(getEditableZones(layout), system, dpadMode))
    setSelectedId(dpadMode === 'stick' ? 'zone:left' : 'zone:left')
    setHiddenIds(new Set())
    setGlobalScale(100)
    setGlobalOpacity(Math.round(opacity * 100))
    setSnapToGrid(false)
  }, [open, layout, system, dpadMode, opacity])

  const measureSelection = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !selected) return
    const stageRect = stage.getBoundingClientRect()

    let target: Element | null = null
    if (selected.kind === 'zone') {
      target = stage.querySelector(`[data-layout-zone="${selected.zoneId}"]`)
    } else if (selected.buttonId) {
      const zone = stage.querySelector(`[data-layout-zone="${selected.zoneId}"]`)
      target = zone?.querySelector(`[data-layout-button="${selected.buttonId}"]`) ?? null
    }

    if (!target) {
      setSelectionRect(null)
      return
    }

    const rect = target.getBoundingClientRect()
    setSelectionRect({
      left: rect.left - stageRect.left,
      top: rect.top - stageRect.top,
      width: rect.width,
      height: rect.height,
    })
    setGuides({
      x: rect.left - stageRect.left + rect.width / 2,
      y: rect.top - stageRect.top + rect.height / 2,
    })
  }, [selected])

  useLayoutEffect(() => {
    if (!open) return
    measureSelection()
    const onResize = () => measureSelection()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, measureSelection, draftZones, globalScale, globalOpacity, hiddenIds, selectedId])

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
        return { ...prev, [zoneId]: { ...zone, buttons } }
      })
    },
    [dpadMode, system],
  )

  const applyGlobalScaleToZones = useCallback(
    (zones: VirtualControlsLayout['zones'], scalePct: number): VirtualControlsLayout['zones'] => {
      const factor = scalePct / 100
      const next = { ...zones }
      for (const zoneId of ZONE_ORDER) {
        const zone = next[zoneId]
        if (!zone) continue
        next[zoneId] = { ...zone, scale: clampScale((zone.scale ?? 1) * factor) }
      }
      return next
    },
    [],
  )

  const handleSave = () => {
    const scaled = globalScale === 100 ? draftZones : applyGlobalScaleToZones(draftZones, globalScale)
    onSave(customLayoutFromZones(scaled), { opacity: globalOpacity / 100 })
  }

  const handleReset = () => {
    const base = getEditableZones(DEFAULT_LAYOUT)
    setDraftZones(ensureAllZoneButtons(base, system, dpadMode))
    setGlobalScale(100)
    setGlobalOpacity(Math.round(opacity * 100))
    setHiddenIds(new Set())
  }

  const applyPreset = (preset: VirtualLayoutPreset) => {
    if (preset === 'default') {
      handleReset()
    } else if (preset === 'custom') {
      // keep current
    } else {
      setDraftZones(ensureAllZoneButtons(presetLayout(preset).zones, system, dpadMode))
    }
    setProfileOpen(false)
  }

  const toggleVisibility = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isHidden = (id: string) => hiddenIds.has(id)

  const endDrag = useCallback(() => {
    dragRef.current = null
    dragOriginRef.current = null
    draggingRef.current = false
    measureSelection()
  }, [measureSelection])

  const onPointerDownMove = (e: ReactPointerEvent) => {
    if (!selected || selected.kind !== 'zone') return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { type: 'move-zone', zoneId: selected.zoneId }
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerDownMoveButton = (e: ReactPointerEvent) => {
    if (!selected?.buttonId) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      type: 'move-button',
      zoneId: selected.zoneId,
      buttonId: selected.buttonId,
    }
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerDownResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const stage = stageRef.current
    if (!stage || !selected) return

    if (selected.kind === 'zone') {
      const zone = ensureZone(draftZones, selected.zoneId)
      dragRef.current = {
        type: 'resize-zone',
        zoneId: selected.zoneId,
        startScale: resolveZoneScale(zone),
        startDist: 1,
      }
    } else if (selected.buttonId) {
      const zone = ensureZone(draftZones, selected.zoneId)
      const btn = resolveZoneButtons(zone, selected.zoneId, system, dpadMode)[selected.buttonId]!
      dragRef.current = {
        type: 'resize-button',
        zoneId: selected.zoneId,
        buttonId: selected.buttonId,
        startScale: btn.scale,
        startDist: 1,
      }
    }
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    const origin = dragOriginRef.current
    const stage = stageRef.current
    if (!drag || !origin || !stage) return

    const dx = e.clientX - origin.x
    const dy = e.clientY - origin.y

    if (drag.type === 'move-zone') {
      if (!draggingRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      draggingRef.current = true
      const next = pointerToPercent(stage, e.clientX, e.clientY, snapToGrid)
      updateZone(drag.zoneId, next)
      return
    }

    if (drag.type === 'move-button') {
      if (!draggingRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      draggingRef.current = true
      const zoneEl = stage.querySelector(`[data-layout-zone="${drag.zoneId}"]`)
      if (!zoneEl) return
      const next = pointerToPercent(zoneEl as HTMLElement, e.clientX, e.clientY, snapToGrid)
      updateZoneButtons(drag.zoneId, drag.buttonId, next)
      return
    }

    if (drag.type === 'resize-zone' || drag.type === 'resize-button') {
      const delta = (dx + dy) / 200
      const nextScale = clampScale(drag.startScale + delta)
      if (drag.type === 'resize-zone') {
        updateZone(drag.zoneId, { scale: nextScale })
      } else {
        updateZoneButtons(drag.zoneId, drag.buttonId, { scale: nextScale })
      }
    }
  }

  const selectedZone = selected ? ensureZone(draftZones, selected.zoneId) : null
  const selectedButton =
    selected?.buttonId && selectedZone
      ? resolveZoneButtons(selectedZone, selected.zoneId, system, dpadMode)[selected.buttonId]
      : undefined

  const selectedScale =
    selected?.kind === 'zone'
      ? Math.round(resolveZoneScale(selectedZone ?? undefined) * 100)
      : Math.round((selectedButton?.scale ?? 1) * 100)

  if (!open) return null

  const systemLabel = system.toUpperCase()
  const subtitle = gameName ? `${systemLabel} · ${gameName}` : systemLabel

  return (
    <div className="layout-editor" role="dialog" aria-label="Edit virtual controller layout">
      <header className="layout-editor__header">
        <div className="layout-editor__header-left">
          <details className="layout-editor__dropdown" open={actionsOpen} onToggle={(e) => setActionsOpen(e.currentTarget.open)}>
            <summary className="layout-editor__dropdown-trigger">Emulator Actions</summary>
            <div className="layout-editor__dropdown-menu">
              {onOpenSettings && (
                <button type="button" onClick={onOpenSettings}>
                  Settings
                </button>
              )}
              {onOpenControllers && (
                <button type="button" onClick={onOpenControllers}>
                  Controllers
                </button>
              )}
            </div>
          </details>
          <div className="layout-editor__title-block">
            <strong className="layout-editor__brand">Retro Games</strong>
            <span className="layout-editor__subtitle">{subtitle}</span>
          </div>
        </div>

        <p className="layout-editor__instruction">
          Drag each zone to reposition. Positions are saved per device. Opacity, scale, and alignment
          guides can be adjusted from the floating toolbar.
        </p>

        <div className="layout-editor__header-right">
          {gamepadName && (
            <span className="layout-editor__gamepad">
              <span className="layout-editor__gamepad-dot" aria-hidden="true" />
              {gamepadName}
            </span>
          )}
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            Save Layout
          </button>
          <details className="layout-editor__dropdown" open={profileOpen} onToggle={(e) => setProfileOpen(e.currentTarget.open)}>
            <summary className="layout-editor__dropdown-trigger">Profile Manager</summary>
            <div className="layout-editor__dropdown-menu">
              <button type="button" onClick={() => applyPreset('default')}>Default</button>
              <button type="button" onClick={() => applyPreset('compact')}>Compact</button>
              <button type="button" onClick={() => applyPreset('wide')}>Wide</button>
              <button type="button" onClick={() => applyPreset('custom')}>Custom</button>
            </div>
          </details>
        </div>
      </header>

      <div className="layout-editor__workspace">
        <aside className="layout-editor__sidebar layout-editor__sidebar--left">
          <h3 className="layout-editor__sidebar-title">Quick Edit Tools</h3>

          <label className="layout-editor__field">
            <span>Global Scale</span>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={globalScale}
              onChange={(e) => setGlobalScale(Number(e.target.value))}
            />
            <em>{globalScale}%</em>
          </label>

          <label className="layout-editor__field">
            <span>Global Opacity</span>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={globalOpacity}
              onChange={(e) => setGlobalOpacity(Number(e.target.value))}
            />
            <em>{globalOpacity}%</em>
          </label>

          <label className="layout-editor__toggle">
            <span>Snap to Grid</span>
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
            />
          </label>

          {selected && (
            <label className="layout-editor__field">
              <span>{selected.label} size</span>
              <input
                type="range"
                min={50}
                max={200}
                step={5}
                value={selectedScale}
                onChange={(e) => {
                  const scale = Number(e.target.value) / 100
                  if (selected.kind === 'zone') updateZone(selected.zoneId, { scale })
                  else if (selected.buttonId) updateZoneButtons(selected.zoneId, selected.buttonId, { scale })
                }}
              />
              <em>{selectedScale}%</em>
            </label>
          )}

          <button type="button" className="btn btn--ghost layout-editor__reset" onClick={handleReset}>
            Reset to Defaults
          </button>
        </aside>

        <main className="layout-editor__canvas">
          <div className="layout-editor__grid" aria-hidden="true" />
          <div className="layout-editor__stage" ref={stageRef}>
            <VirtualController
              system={system}
              onPress={() => {}}
              onRelease={() => {}}
              visible
              dpadMode={dpadMode}
              overlay
              size={size}
              opacity={globalOpacity / 100}
              layout={previewLayout}
              editing
              hiddenElements={hiddenIds}
              editorGlobalScale={globalScale / 100}
            />

            {guides && (
              <>
                <div className="layout-editor__guide layout-editor__guide--v" style={{ left: guides.x }} />
                <div className="layout-editor__guide layout-editor__guide--h" style={{ top: guides.y }} />
              </>
            )}

            {selectionRect && !isHidden(selectedId) && (
              <div
                className="layout-editor__selection"
                style={{
                  left: selectionRect.left,
                  top: selectionRect.top,
                  width: selectionRect.width,
                  height: selectionRect.height,
                }}
                onPointerDown={selected.kind === 'zone' ? onPointerDownMove : onPointerDownMoveButton}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span className="layout-editor__selection-label">{selected.label}</span>
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    className={`layout-editor__resize layout-editor__resize--${corner}`}
                    aria-label={`Resize ${selected.label}`}
                    onPointerDown={onPointerDownResize}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className="layout-editor__sidebar layout-editor__sidebar--right">
          <h3 className="layout-editor__sidebar-title">Element Manager</h3>

          <details className="layout-editor__dropdown layout-editor__dropdown--block">
            <summary className="layout-editor__dropdown-trigger">Add Control</summary>
            <div className="layout-editor__dropdown-menu">
              <p className="layout-editor__dropdown-hint">All standard controls are already on screen. Select one below to edit.</p>
            </div>
          </details>

          <ul className="layout-editor__elements">
            {elements.map((el) => (
              <li key={el.id}>
                <button
                  type="button"
                  className={`layout-editor__element${selectedId === el.id ? ' layout-editor__element--selected' : ''}${isHidden(el.id) ? ' layout-editor__element--hidden' : ''}`}
                  onClick={() => setSelectedId(el.id)}
                >
                  <span className="layout-editor__element-icon" aria-hidden="true">
                    {el.icon}
                  </span>
                  <span className="layout-editor__element-label">{el.label}</span>
                  <span className="layout-editor__element-move" aria-hidden="true">⠿</span>
                </button>
                <button
                  type="button"
                  className="layout-editor__visibility"
                  aria-label={isHidden(el.id) ? `Show ${el.label}` : `Hide ${el.label}`}
                  onClick={() => toggleVisibility(el.id)}
                >
                  {isHidden(el.id) ? '○' : '◉'}
                </button>
              </li>
            ))}
          </ul>

          {selected?.kind === 'button' && (
            <button
              type="button"
              className="btn btn--text"
              onClick={() =>
                updateZone(selected.zoneId, {
                  buttons: resetZoneButtons(selected.zoneId, system, dpadMode),
                })
              }
            >
              Reset {LAYOUT_ZONE_LABELS[selected.zoneId]} alignment
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}
