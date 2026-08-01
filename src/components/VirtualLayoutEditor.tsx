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
  resolveZoneRotation,
  resolveZoneScaleX,
  resolveZoneScaleY,
  leftZoneHasDpad,
  stickZoneActive,
  addLeftDpadButtons,
  createStickZone,
  LEFT_DPAD_BUTTONS,
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
  rotation?: number
}

type ResizeAxis = 'uniform' | 'x' | 'y'

type DragMode =
  | { type: 'move-zone'; zoneId: VirtualLayoutZoneId }
  | { type: 'move-button'; zoneId: VirtualLayoutZoneId; buttonId: VirtualLayoutButtonId }
  | {
      type: 'resize-zone'
      zoneId: VirtualLayoutZoneId
      axis: ResizeAxis
      startScaleX: number
      startScaleY: number
    }
  | {
      type: 'resize-button'
      zoneId: VirtualLayoutZoneId
      buttonId: VirtualLayoutButtonId
      startScale: number
      startDist: number
    }
  | {
      type: 'rotate-zone'
      zoneId: VirtualLayoutZoneId
      startRotation: number
      startAngle: number
      centerX: number
      centerY: number
    }

const ZONE_ORDER: VirtualLayoutZoneId[] = ['left', 'stick', 'actions', 'meta', 'shoulders']
const DRAG_THRESHOLD_PX = 5
const SNAP_STEP = 5
const MAX_EDITOR_HISTORY = 50
const COMPACT_LAYOUT_MQ = '(max-width: 960px), (max-height: 520px)'

interface EditorSnapshot {
  zones: VirtualControlsLayout['zones']
  hiddenIds: string[]
  globalScale: number
  globalOpacity: number
}

function cloneZones(zones: VirtualControlsLayout['zones']): VirtualControlsLayout['zones'] {
  return structuredClone(zones)
}

function createSnapshot(
  zones: VirtualControlsLayout['zones'],
  hiddenIds: Set<string>,
  globalScale: number,
  globalOpacity: number,
): EditorSnapshot {
  return {
    zones: cloneZones(zones),
    hiddenIds: Array.from(hiddenIds),
    globalScale,
    globalOpacity,
  }
}

function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(COMPACT_LAYOUT_MQ).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_LAYOUT_MQ)
    const onChange = () => setCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

function clampScale(value: number): number {
  return Math.min(2, Math.max(0.5, Math.round(value * 100) / 100))
}

function clampRotation(value: number): number {
  let next = Math.round(value)
  while (next > 180) next -= 360
  while (next < -180) next += 360
  return next
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

function buildElements(
  system: SystemId,
  dpadMode: 'dpad' | 'stick',
  zones: VirtualControlsLayout['zones'],
): EditorElement[] {
  const items: EditorElement[] = []
  const showShoulders = system === 'snes'
  const leftZone = zones.left
  const hasDpad = leftZoneHasDpad(leftZone, dpadMode)
  const hasStick = stickZoneActive(zones, dpadMode)

  if (hasDpad) {
    items.push({
      id: elementId('left'),
      kind: 'zone',
      zoneId: 'left',
      label: 'D-pad',
      icon: '✥',
    })

    for (const buttonId of LEFT_DPAD_BUTTONS) {
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

  if (hasStick) {
    items.push({
      id: elementId('stick'),
      kind: 'zone',
      zoneId: 'stick',
      label: LAYOUT_ZONE_LABELS.stick,
      icon: '◎',
    })

    items.push({
      id: elementId('stick', 'stick'),
      kind: 'button',
      zoneId: 'stick',
      buttonId: 'stick',
      label: BUTTON_LABELS.stick,
      icon: '◎',
    })
  }

  for (const zoneId of ['actions', 'meta', 'shoulders'] as VirtualLayoutZoneId[]) {
    if (zoneId === 'shoulders' && !showShoulders) continue
    const zone = zones[zoneId]
    const buttons = buttonsForZone(zoneId, system, dpadMode, zone)
    if (buttons.length === 0) continue

    items.push({
      id: elementId(zoneId),
      kind: 'zone',
      zoneId,
      label: LAYOUT_ZONE_LABELS[zoneId],
      icon: zoneId === 'actions' ? '⊕' : zoneId === 'meta' ? '⊞' : '⊟',
    })

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
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const isCompactLayout = useCompactLayout()

  const stateRef = useRef({ draftZones, hiddenIds, globalScale, globalOpacity })
  const pastRef = useRef<EditorSnapshot[]>([])
  const futureRef = useRef<EditorSnapshot[]>([])
  const historyDragSnapshotRef = useRef<EditorSnapshot | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)

  useEffect(() => {
    stateRef.current = { draftZones, hiddenIds, globalScale, globalOpacity }
  }, [draftZones, hiddenIds, globalScale, globalOpacity])

  const captureSnapshot = useCallback((): EditorSnapshot => {
    const { draftZones: zones, hiddenIds: hidden, globalScale: scale, globalOpacity: op } =
      stateRef.current
    return createSnapshot(zones, hidden, scale, op)
  }, [])

  const applySnapshot = useCallback((snap: EditorSnapshot) => {
    setDraftZones(cloneZones(snap.zones))
    setHiddenIds(new Set(snap.hiddenIds))
    setGlobalScale(snap.globalScale)
    setGlobalOpacity(snap.globalOpacity)
  }, [])

  const pushHistory = useCallback(() => {
    pastRef.current.push(captureSnapshot())
    if (pastRef.current.length > MAX_EDITOR_HISTORY) pastRef.current.shift()
    futureRef.current = []
    setHistoryVersion((v) => v + 1)
  }, [captureSnapshot])

  const undo = useCallback(() => {
    const past = pastRef.current
    if (past.length === 0) return
    futureRef.current.push(captureSnapshot())
    const prev = past.pop()!
    applySnapshot(prev)
    setHistoryVersion((v) => v + 1)
  }, [applySnapshot, captureSnapshot])

  const redo = useCallback(() => {
    const future = futureRef.current
    if (future.length === 0) return
    pastRef.current.push(captureSnapshot())
    const next = future.pop()!
    applySnapshot(next)
    setHistoryVersion((v) => v + 1)
  }, [applySnapshot, captureSnapshot])

  const beginDragHistory = useCallback(() => {
    historyDragSnapshotRef.current = captureSnapshot()
  }, [captureSnapshot])

  const canUndo = pastRef.current.length > 0
  const canRedo = futureRef.current.length > 0
  void historyVersion

  const elements = useMemo(
    () => buildElements(system, dpadMode, draftZones),
    [system, dpadMode, draftZones],
  )
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
    const narrow = window.matchMedia(COMPACT_LAYOUT_MQ).matches
    setLeftCollapsed(narrow)
    setRightCollapsed(narrow)
    pastRef.current = []
    futureRef.current = []
    historyDragSnapshotRef.current = null
    setHistoryVersion(0)
  }, [open, layout, system, dpadMode, opacity])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, redo, undo])

  const openToolsPanel = useCallback(() => {
    setLeftCollapsed(false)
    setRightCollapsed(true)
  }, [])

  const openElementsPanel = useCallback(() => {
    setRightCollapsed(false)
    setLeftCollapsed(true)
  }, [])

  const closePanels = useCallback(() => {
    setLeftCollapsed(true)
    setRightCollapsed(true)
  }, [])

  const mobilePanelOpen = isCompactLayout && (!leftCollapsed || !rightCollapsed)

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

    if (selected.kind === 'zone') {
      const zone = ensureZone(draftZones, selected.zoneId)
      const rotation = resolveZoneRotation(zone)
      const el = target as HTMLElement
      const bounds = el.getBoundingClientRect()
      const centerX = bounds.left + bounds.width / 2 - stageRect.left
      const centerY = bounds.top + bounds.height / 2 - stageRect.top

      setSelectionRect({
        left: centerX,
        top: centerY,
        width: el.offsetWidth,
        height: el.offsetHeight,
        rotation,
      })
      setGuides({ x: centerX, y: centerY })
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
  }, [draftZones, globalScale, selected])

  useLayoutEffect(() => {
    if (!open) return
    measureSelection()
    const onResize = () => measureSelection()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, measureSelection, draftZones, globalScale, globalOpacity, hiddenIds, selectedId, leftCollapsed, rightCollapsed])

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
        next[zoneId] = {
          ...zone,
          scaleX: clampScale(resolveZoneScaleX(zone) * factor),
          scaleY: clampScale(resolveZoneScaleY(zone) * factor),
        }
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
    pushHistory()
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
      pushHistory()
      setDraftZones(ensureAllZoneButtons(presetLayout(preset).zones, system, dpadMode))
    }
    setProfileOpen(false)
  }

  const toggleVisibility = (id: string) => {
    pushHistory()
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isHidden = (id: string) => hiddenIds.has(id)

  const endDrag = useCallback(() => {
    const snapshot = historyDragSnapshotRef.current
    if (draggingRef.current && snapshot) {
      pastRef.current.push(snapshot)
      if (pastRef.current.length > MAX_EDITOR_HISTORY) pastRef.current.shift()
      futureRef.current = []
      setHistoryVersion((v) => v + 1)
    }
    historyDragSnapshotRef.current = null
    dragRef.current = null
    dragOriginRef.current = null
    draggingRef.current = false
    measureSelection()
  }, [measureSelection])

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.layout-editor__selection')) return

    const buttonEl = (e.target as HTMLElement).closest('[data-layout-button]')
    const zoneEl = (e.target as HTMLElement).closest('[data-layout-zone]')

    if (buttonEl && zoneEl) {
      const buttonId = buttonEl.getAttribute('data-layout-button') as VirtualLayoutButtonId | null
      const zoneId = zoneEl.getAttribute('data-layout-zone') as VirtualLayoutZoneId | null
      if (buttonId && zoneId) {
        setSelectedId(elementId(zoneId, buttonId))
        return
      }
    }

    if (zoneEl) {
      const zoneId = zoneEl.getAttribute('data-layout-zone') as VirtualLayoutZoneId | null
      if (zoneId) setSelectedId(elementId(zoneId))
    }
  }

  const onPointerDownMove = (e: ReactPointerEvent) => {
    if (!selected || selected.kind !== 'zone') return
    e.preventDefault()
    e.stopPropagation()
    beginDragHistory()
    dragRef.current = { type: 'move-zone', zoneId: selected.zoneId }
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerDownMoveButton = (e: ReactPointerEvent) => {
    if (!selected?.buttonId) return
    e.preventDefault()
    e.stopPropagation()
    beginDragHistory()
    dragRef.current = {
      type: 'move-button',
      zoneId: selected.zoneId,
      buttonId: selected.buttonId,
    }
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerDownResize = (axis: ResizeAxis) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selected) return
    beginDragHistory()

    if (selected.kind === 'zone') {
      const zone = ensureZone(draftZones, selected.zoneId)
      dragRef.current = {
        type: 'resize-zone',
        zoneId: selected.zoneId,
        axis,
        startScaleX: resolveZoneScaleX(zone),
        startScaleY: resolveZoneScaleY(zone),
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

  const onPointerDownRotate = (e: ReactPointerEvent) => {
    if (!selected || selected.kind !== 'zone' || !selectionRect) return
    e.preventDefault()
    e.stopPropagation()
    const stage = stageRef.current
    if (!stage) return
    beginDragHistory()
    const stageRect = stage.getBoundingClientRect()
    const centerX = stageRect.left + selectionRect.left
    const centerY = stageRect.top + selectionRect.top
    const zone = ensureZone(draftZones, selected.zoneId)
    const startAngle = (Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180) / Math.PI
    dragRef.current = {
      type: 'rotate-zone',
      zoneId: selected.zoneId,
      startRotation: resolveZoneRotation(zone),
      startAngle,
      centerX,
      centerY,
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

    if (drag.type === 'resize-zone') {
      if (drag.axis === 'uniform') {
        const delta = (dx + dy) / 200
        updateZone(drag.zoneId, {
          scaleX: clampScale(drag.startScaleX + delta),
          scaleY: clampScale(drag.startScaleY + delta),
        })
      } else if (drag.axis === 'x') {
        updateZone(drag.zoneId, { scaleX: clampScale(drag.startScaleX + dx / 150) })
      } else {
        updateZone(drag.zoneId, { scaleY: clampScale(drag.startScaleY + dy / 150) })
      }
      return
    }

    if (drag.type === 'resize-button') {
      const delta = (dx + dy) / 200
      const nextScale = clampScale(drag.startScale + delta)
      updateZoneButtons(drag.zoneId, drag.buttonId, { scale: nextScale })
      return
    }

    if (drag.type === 'rotate-zone') {
      const angle = (Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX) * 180) / Math.PI
      updateZone(drag.zoneId, { rotation: clampRotation(drag.startRotation + angle - drag.startAngle) })
    }
  }

  const leftZone = ensureZone(draftZones, 'left')
  const canAddDpad = !leftZoneHasDpad(leftZone, dpadMode)
  const canAddStick = !stickZoneActive(draftZones, dpadMode)

  const addDpad = () => {
    pushHistory()
    setDraftZones((prev) => ({
      ...prev,
      left: addLeftDpadButtons(ensureZone(prev, 'left')),
    }))
    setSelectedId('zone:left')
  }

  const addStick = () => {
    pushHistory()
    setDraftZones((prev) => ({
      ...prev,
      stick: prev.stick ?? createStickZone(ensureZone(prev, 'left')),
    }))
    setSelectedId('zone:stick')
  }

  const selectedZone = selected ? ensureZone(draftZones, selected.zoneId) : null
  const selectedButton =
    selected?.buttonId && selectedZone
      ? resolveZoneButtons(selectedZone, selected.zoneId, system, dpadMode)[selected.buttonId]
      : undefined

  const selectedScaleX =
    selected?.kind === 'zone'
      ? Math.round(resolveZoneScaleX(selectedZone ?? undefined) * 100)
      : Math.round((selectedButton?.scale ?? 1) * 100)
  const selectedScaleY =
    selected?.kind === 'zone' ? Math.round(resolveZoneScaleY(selectedZone ?? undefined) * 100) : selectedScaleX
  const selectedRotation =
    selected?.kind === 'zone' ? resolveZoneRotation(selectedZone ?? undefined) : 0

  if (!open) return null

  const systemLabel = system.toUpperCase()
  const subtitle = gameName ? `${systemLabel} · ${gameName}` : systemLabel

  return (
    <div
      className={`layout-editor${isCompactLayout ? ' layout-editor--compact' : ''}`}
      role="dialog"
      aria-label="Edit virtual controller layout"
    >
      <header className="layout-editor__header">
        <div className="layout-editor__header-left">
          <details
            className="layout-editor__dropdown layout-editor__dropdown--header"
            open={actionsOpen}
            onToggle={(e) => setActionsOpen(e.currentTarget.open)}
          >
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
          Tap a control or region outline to select it. Drag to move; use corner, edge, or rotation
          handles on regions to resize and rotate.
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
            Save
          </button>
          <details
            className="layout-editor__dropdown layout-editor__dropdown--header"
            open={profileOpen}
            onToggle={(e) => setProfileOpen(e.currentTarget.open)}
          >
            <summary className="layout-editor__dropdown-trigger">Profile</summary>
            <div className="layout-editor__dropdown-menu">
              <button type="button" onClick={() => applyPreset('default')}>Default</button>
              <button type="button" onClick={() => applyPreset('compact')}>Compact</button>
              <button type="button" onClick={() => applyPreset('wide')}>Wide</button>
              <button type="button" onClick={() => applyPreset('custom')}>Custom</button>
            </div>
          </details>
        </div>
      </header>

      {mobilePanelOpen && (
        <button
          type="button"
          className="layout-editor__mobile-backdrop"
          aria-label="Close panel"
          onClick={closePanels}
        />
      )}

      <div className="layout-editor__workspace">
        <aside
          className={[
            'layout-editor__sidebar',
            'layout-editor__sidebar--left',
            leftCollapsed && 'layout-editor__sidebar--collapsed',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className="layout-editor__sidebar-toggle"
            aria-label={leftCollapsed ? 'Expand Quick Edit Tools' : 'Collapse Quick Edit Tools'}
            aria-expanded={!leftCollapsed}
            onClick={() => setLeftCollapsed((v) => !v)}
          >
            {leftCollapsed ? '»' : '«'}
          </button>
          <div className="layout-editor__sidebar-body">
            <h3 className="layout-editor__sidebar-title">Quick Edit Tools</h3>

            <div className="layout-editor__history">
              <button
                type="button"
                className="btn btn--ghost layout-editor__history-btn"
                disabled={!canUndo}
                onClick={undo}
                aria-label="Undo"
              >
                Undo
              </button>
              <button
                type="button"
                className="btn btn--ghost layout-editor__history-btn"
                disabled={!canRedo}
                onClick={redo}
                aria-label="Redo"
              >
                Redo
              </button>
            </div>

            <label className="layout-editor__field">
              <span>Global Scale</span>
              <input
                type="range"
                min={50}
                max={200}
                step={5}
                value={globalScale}
                onPointerDown={pushHistory}
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
                onPointerDown={pushHistory}
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

            {selected && selected.kind === 'zone' && (
              <>
                <label className="layout-editor__field">
                  <span>{selected.label} width</span>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={5}
                    value={selectedScaleX}
                    onPointerDown={pushHistory}
                    onChange={(e) =>
                      updateZone(selected.zoneId, { scaleX: Number(e.target.value) / 100 })
                    }
                  />
                  <em>{selectedScaleX}%</em>
                </label>
                <label className="layout-editor__field">
                  <span>{selected.label} height</span>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={5}
                    value={selectedScaleY}
                    onPointerDown={pushHistory}
                    onChange={(e) =>
                      updateZone(selected.zoneId, { scaleY: Number(e.target.value) / 100 })
                    }
                  />
                  <em>{selectedScaleY}%</em>
                </label>
                <label className="layout-editor__field">
                  <span>{selected.label} rotation</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={selectedRotation}
                    onPointerDown={pushHistory}
                    onChange={(e) =>
                      updateZone(selected.zoneId, { rotation: Number(e.target.value) })
                    }
                  />
                  <em>{selectedRotation}°</em>
                </label>
              </>
            )}

            {selected && selected.kind === 'button' && (
              <label className="layout-editor__field">
                <span>{selected.label} size</span>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={selectedScaleX}
                  onPointerDown={pushHistory}
                  onChange={(e) => {
                    if (selected.buttonId) {
                      updateZoneButtons(selected.zoneId, selected.buttonId, {
                        scale: Number(e.target.value) / 100,
                      })
                    }
                  }}
                />
                <em>{selectedScaleX}%</em>
              </label>
            )}

            <button type="button" className="btn btn--ghost layout-editor__reset" onClick={handleReset}>
              Reset to Defaults
            </button>
          </div>
        </aside>

        <main className="layout-editor__canvas">
          <div className="layout-editor__grid" aria-hidden="true" />
          <div className="layout-editor__stage" ref={stageRef} onPointerDown={onStagePointerDown}>
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
                className={`layout-editor__selection${selected.kind === 'zone' ? ' layout-editor__selection--zone' : ''}`}
                style={
                  selected.kind === 'zone'
                    ? {
                        left: selectionRect.left,
                        top: selectionRect.top,
                        width: selectionRect.width,
                        height: selectionRect.height,
                        transform: `translate(-50%, -50%) rotate(${selectionRect.rotation ?? 0}deg)`,
                      }
                    : {
                        left: selectionRect.left,
                        top: selectionRect.top,
                        width: selectionRect.width,
                        height: selectionRect.height,
                      }
                }
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
                    onPointerDown={onPointerDownResize(selected.kind === 'zone' ? 'uniform' : 'uniform')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                ))}
                {selected.kind === 'zone' && (
                  <>
                    {(['n', 'e', 's', 'w'] as const).map((edge) => (
                      <button
                        key={edge}
                        type="button"
                        className={`layout-editor__resize layout-editor__resize--${edge}`}
                        aria-label={`Resize ${selected.label} ${edge === 'n' || edge === 's' ? 'vertically' : 'horizontally'}`}
                        onPointerDown={onPointerDownResize(edge === 'e' || edge === 'w' ? 'x' : 'y')}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                    ))}
                    <button
                      type="button"
                      className="layout-editor__rotate"
                      aria-label={`Rotate ${selected.label}`}
                      onPointerDown={onPointerDownRotate}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {isCompactLayout && (
            <div className="layout-editor__mobile-dock" aria-label="Editor panels">
              <button
                type="button"
                className={`layout-editor__mobile-dock-btn${!leftCollapsed ? ' layout-editor__mobile-dock-btn--active' : ''}`}
                onClick={() => (leftCollapsed ? openToolsPanel() : closePanels())}
              >
                Tools
              </button>
              <button
                type="button"
                className={`layout-editor__mobile-dock-btn${!rightCollapsed ? ' layout-editor__mobile-dock-btn--active' : ''}`}
                onClick={() => (rightCollapsed ? openElementsPanel() : closePanels())}
              >
                Elements
              </button>
            </div>
          )}
        </main>

        <aside
          className={[
            'layout-editor__sidebar',
            'layout-editor__sidebar--right',
            rightCollapsed && 'layout-editor__sidebar--collapsed',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className="layout-editor__sidebar-toggle"
            aria-label={rightCollapsed ? 'Expand Element Manager' : 'Collapse Element Manager'}
            aria-expanded={!rightCollapsed}
            onClick={() => setRightCollapsed((v) => !v)}
          >
            {rightCollapsed ? '«' : '»'}
          </button>
          <div className="layout-editor__sidebar-body">
            <h3 className="layout-editor__sidebar-title">Element Manager</h3>

            <details className="layout-editor__dropdown layout-editor__dropdown--block">
              <summary className="layout-editor__dropdown-trigger">Add Control</summary>
              <div className="layout-editor__dropdown-menu">
                {canAddDpad && (
                  <button type="button" onClick={addDpad}>
                    D-pad
                  </button>
                )}
                {canAddStick && (
                  <button type="button" onClick={addStick}>
                    Analog stick
                  </button>
                )}
                {!canAddDpad && !canAddStick && (
                  <p className="layout-editor__dropdown-hint">
                    All movement controls are already on screen.
                  </p>
                )}
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
                onClick={() => {
                  pushHistory()
                  updateZone(selected.zoneId, {
                    buttons: resetZoneButtons(selected.zoneId, system, dpadMode),
                  })
                }}
              >
                Reset {LAYOUT_ZONE_LABELS[selected.zoneId]} alignment
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
