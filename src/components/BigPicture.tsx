import { useEffect, useMemo, useRef, useState } from 'react'
import { renderCover } from '../lib/coverArt'
import { resolveSystemCore, SYSTEMS, type SystemId } from '../lib/cores'
import type { LibraryRom } from '../lib/library'
import type { MediaEntry } from '../lib/mediaFolder'
import { readShelfFiles, type ShelfSummary } from '../lib/romShelf'
import { useMenuPad, type MenuCommand } from '../hooks/useMenuPad'
import { MediaStage } from './MediaStage'
import { RomLoader } from './RomLoader'

interface RomLaunchOptions {
  arcadeCore?: string
  system?: SystemId
  core?: string
}

export interface MediaFolderSource {
  name: string | null
  entries: MediaEntry[]
  scanning: boolean
  error: string | null
  needsPermission: boolean
  canPick: boolean
  pick: () => void
  resume: () => void
  forget: () => void
  adoptFiles: (list: FileList) => void
}

interface BigPictureProps {
  bundled: LibraryRom[]
  imported: ShelfSummary[]
  folder: MediaFolderSource
  disabled?: boolean
  error?: string | null
  shelfError?: string | null
  focusId?: string | null
  arcadeCore: string
  onArcadeCoreChange: (core: string) => void
  onPlayFiles: (files: File[], options?: RomLaunchOptions) => void
  onPlayBundled: (rom: LibraryRom) => void
  onDemo: () => void
  onAdd: (files: File[], options: { system: SystemId; core: string }) => Promise<string>
  onRemove: (id: string) => Promise<void>
  onUseCover: (id: string, image: File) => Promise<void>
  onRegenerateCover: (id: string) => Promise<void>
  /** Pause row navigation while a dialog is open on top of the library. */
  suspendNavigation?: boolean
  /** When false, the page nav owns the controller. */
  padEnabled?: boolean
  onLeaveUp?: () => void
}

type Lane = 'games' | 'music' | 'video' | 'photo'

const LANES: Array<{ id: Lane; label: string }> = [
  { id: 'games', label: 'Games' },
  { id: 'music', label: 'Music' },
  { id: 'video', label: 'Videos' },
  { id: 'photo', label: 'Photos' },
]

type PictureItem =
  | { key: string; title: string; system: SystemId; kind: 'bundled'; rom: LibraryRom }
  | { key: string; title: string; system: SystemId; kind: 'shelf'; entry: ShelfSummary }
  | { key: string; title: string; system: SystemId; kind: 'folder-game'; file: File; core: string }
  | { key: string; title: string; kind: 'media'; media: MediaEntry }

type ActionItem = { id: string; label: string; run: () => void; disabled?: boolean }

export function BigPicture({
  bundled,
  imported,
  folder,
  disabled,
  error,
  shelfError,
  focusId,
  arcadeCore,
  onArcadeCoreChange,
  onPlayFiles,
  onPlayBundled,
  onDemo,
  onAdd,
  onRemove,
  onUseCover,
  onRegenerateCover,
  suspendNavigation = false,
  padEnabled = true,
  onLeaveUp,
}: BigPictureProps) {
  const [adding, setAdding] = useState(false)
  const [lane, setLane] = useState<Lane>('games')
  const [zone, setZone] = useState<'lanes' | 'tiles' | 'actions'>('tiles')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [actionIndex, setActionIndex] = useState(0)
  const [viewer, setViewer] = useState<MediaEntry | null>(null)
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const tileRefs = useRef(new Map<string, HTMLButtonElement>())
  const coverUrlsRef = useRef<string[]>([])

  const items = useMemo<PictureItem[]>(() => {
    if (lane === 'games') {
      const shelfItems: PictureItem[] = imported.map((entry) => ({
        key: `shelf:${entry.id}`,
        title: entry.title,
        system: entry.system,
        kind: 'shelf',
        entry,
      }))
      const bundledItems: PictureItem[] = bundled.map((rom) => ({
        key: `bundled:${rom.file}`,
        title: rom.name,
        system: rom.system,
        kind: 'bundled',
        rom,
      }))
      const folderGames: PictureItem[] = folder.entries
        .filter((entry): entry is MediaEntry & { system: SystemId } => entry.kind === 'game' && entry.system !== null)
        .map((entry) => ({
          key: `folder:${entry.id}`,
          title: entry.name,
          system: entry.system,
          kind: 'folder-game' as const,
          file: entry.file,
          core: resolveSystemCore(entry.system),
        }))
      return [...shelfItems, ...bundledItems, ...folderGames]
    }
    const kind = lane === 'music' ? 'music' : lane === 'video' ? 'video' : 'photo'
    return folder.entries
      .filter((entry) => entry.kind === kind)
      .map((entry) => ({
        key: `media:${entry.id}`,
        title: entry.name,
        kind: 'media' as const,
        media: entry,
      }))
  }, [bundled, folder.entries, imported, lane])

  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null
  const laneIndex = Math.max(0, LANES.findIndex((item) => item.id === lane))

  useEffect(() => {
    if (!focusId) return
    setLane('games')
    setSelectedKey(`shelf:${focusId}`)
    setZone('tiles')
    setAdding(false)
  }, [focusId])

  useEffect(() => {
    if (items.length === 0) return
    if (!items.some((item) => item.key === selectedKey)) setSelectedKey(items[0].key)
  }, [items, selectedKey])

  useEffect(() => {
    if (!selected || zone !== 'tiles') return
    tileRefs.current.get(selected.key)?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selected, zone])

  const coverKey = items
    .map((item) =>
      item.kind === 'shelf' ? `${item.key}:${item.entry.cover.size}:${item.entry.coverKind}` : item.key,
    )
    .join('|')

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    void (async () => {
      const next = new Map<string, string>()
      for (const item of items) {
        const blob =
          item.kind === 'shelf'
            ? item.entry.cover
            : item.kind === 'media' && item.media.kind === 'photo'
              ? item.media.file
              : await renderCover(item.title, item.kind === 'media' ? 'nes' : item.system)
        if (cancelled) break
        const url = URL.createObjectURL(blob)
        created.push(url)
        next.set(item.key, url)
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url))
        return
      }
      const previous = coverUrlsRef.current
      coverUrlsRef.current = created
      setCovers(next)
      previous.forEach((url) => URL.revokeObjectURL(url))
    })()
    return () => {
      cancelled = true
    }
    // items is rebuilt when coverKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverKey])

  useEffect(() => {
    const input = folderInputRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    return () => {
      coverUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const moveTile = (delta: number) => {
    if (items.length === 0) return
    const index = Math.max(0, items.findIndex((item) => item.key === selected?.key))
    const next = items[(index + delta + items.length) % items.length]
    setSelectedKey(next.key)
    setConfirmRemove(false)
    setZone('tiles')
  }

  const playSelected = async () => {
    if (!selected || disabled || busy) return
    setLocalError(null)
    if (selected.kind === 'bundled') {
      onPlayBundled(selected.rom)
      return
    }
    if (selected.kind === 'folder-game') {
      onPlayFiles([selected.file], { system: selected.system, core: selected.core })
      return
    }
    if (selected.kind === 'media') {
      setViewer(selected.media)
      return
    }
    setBusy(true)
    try {
      const files = await readShelfFiles(selected.entry.id)
      onPlayFiles(files, {
        system: selected.entry.system,
        core: selected.entry.system === 'arcade' ? undefined : selected.entry.core,
        arcadeCore: selected.entry.system === 'arcade' ? selected.entry.core : undefined,
      })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not open that ROM')
    } finally {
      setBusy(false)
    }
  }

  const chooseFolder = () => {
    if (folder.canPick) void folder.pick()
    else folderInputRef.current?.click()
  }

  const saveToLibrary = async (files: File[], options?: RomLaunchOptions) => {
    if (!options?.system || !options.core) return
    setBusy(true)
    setLocalError(null)
    try {
      await onAdd(files, { system: options.system, core: options.core })
      setAdding(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not add that ROM')
    } finally {
      setBusy(false)
    }
  }

  const actions = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = []
    if (selected) {
      list.push({
        id: 'play',
        label: selected.kind === 'media' ? 'Open' : 'Play',
        disabled: disabled || busy,
        run: () => void playSelected(),
      })
    }
    list.push({
      id: 'folder',
      label: folder.name ? 'Rescan folder' : 'Add folder',
      run: chooseFolder,
    })
    if (folder.needsPermission) {
      list.push({ id: 'resume', label: 'Allow folder', run: () => void folder.resume() })
    }
    if (folder.name) {
      list.push({ id: 'forget', label: 'Remove folder', run: () => void folder.forget() })
    }
    list.push({ id: 'add', label: adding ? 'Close' : 'Add ROM', run: () => setAdding((open) => !open) })
    list.push({ id: 'demo', label: 'Try demo', disabled, run: onDemo })
    if (selected?.kind === 'shelf') {
      list.push({ id: 'cover', label: 'Use a cover', run: () => coverInputRef.current?.click() })
      if (selected.entry.coverKind === 'custom') {
        list.push({
          id: 'generate',
          label: 'Generate cover',
          run: () => void onRegenerateCover(selected.entry.id),
        })
      }
      list.push({
        id: 'remove',
        label: confirmRemove ? 'Confirm remove' : 'Remove',
        run: () => {
          if (!confirmRemove) {
            setConfirmRemove(true)
            return
          }
          void onRemove(selected.entry.id)
          setConfirmRemove(false)
        },
      })
    }
    return list
    // playSelected is recreated each render and closes over the latest selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selected,
    disabled,
    busy,
    folder.name,
    folder.needsPermission,
    folder.canPick,
    adding,
    confirmRemove,
  ])

  const focusedAction = actions[Math.min(actionIndex, Math.max(0, actions.length - 1))] ?? null

  const shiftViewer = (delta: number) => {
    if (!viewer) return
    const laneItems = folder.entries.filter((entry) => entry.kind === viewer.kind)
    const index = laneItems.findIndex((entry) => entry.id === viewer.id)
    if (index < 0 || laneItems.length === 0) return
    const next = laneItems[(index + delta + laneItems.length) % laneItems.length]
    setViewer(next)
    setSelectedKey(`media:${next.id}`)
  }

  const onCommand = (command: MenuCommand) => {
    if (viewer) {
      if (command === 'back') setViewer(null)
      else if (command === 'left') shiftViewer(-1)
      else if (command === 'right') shiftViewer(1)
      return
    }
    if (adding && command === 'back') {
      setAdding(false)
      return
    }
    if (command === 'left' || command === 'right') {
      const delta = command === 'right' ? 1 : -1
      if (zone === 'lanes') {
        const next = LANES[(laneIndex + delta + LANES.length) % LANES.length]
        setLane(next.id)
        setZone('lanes')
        return
      }
      if (zone === 'actions') {
        setActionIndex((index) => (index + delta + actions.length) % Math.max(1, actions.length))
        return
      }
      moveTile(delta)
      return
    }
    if (command === 'up') {
      if (zone === 'actions') setZone('tiles')
      else if (zone === 'tiles') setZone('lanes')
      else onLeaveUp?.()
      return
    }
    if (command === 'down') {
      if (zone === 'lanes') setZone(items.length > 0 ? 'tiles' : 'actions')
      else if (zone === 'tiles') setZone('actions')
      return
    }
    if (command === 'confirm') {
      if (zone === 'lanes') setZone(items.length > 0 ? 'tiles' : 'actions')
      else if (zone === 'actions') focusedAction?.run()
      else if (selected) void playSelected()
      return
    }
    if (command === 'back') {
      if (zone === 'actions') setZone('tiles')
      else if (zone === 'tiles') setZone('lanes')
      else onLeaveUp?.()
    }
  }

  useMenuPad(padEnabled && !suspendNavigation, onCommand)

  useEffect(() => {
    if (adding || suspendNavigation || !padEnabled) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, select, textarea')) return
      if (event.key === 'Enter' && target instanceof HTMLElement && target.closest('button')) return
      const keyMap: Record<string, MenuCommand | undefined> = {
        ArrowRight: 'right',
        ArrowLeft: 'left',
        ArrowUp: 'up',
        ArrowDown: 'down',
        Enter: 'confirm',
        Escape: 'back',
      }
      const command = keyMap[event.key]
      if (!command) return
      event.preventDefault()
      onCommand(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // onCommand closes over the latest library focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, selected, items, disabled, busy, suspendNavigation, padEnabled, zone, lane, actionIndex, viewer])

  const coverUrl = selected ? covers.get(selected.key) : null
  const systemLabel =
    selected && selected.kind !== 'media' ? SYSTEMS[selected.system].label : laneLabel(lane)

  return (
    <section className="bp" aria-label="Library">
      <div className="bp__lanes" role="tablist" aria-label="Library sections">
        {LANES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === lane}
            className={[
              'bp__lane',
              item.id === lane && 'bp__lane--active',
              zone === 'lanes' && item.id === lane && 'bp__lane--pad',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              setLane(item.id)
              setZone('lanes')
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="bp__stage">
        <div className="bp__hero-cover">
          {coverUrl ? (
            <img src={coverUrl} alt="" />
          ) : (
            <div className="bp__hero-empty">{selected ? systemLabel : 'Add media'}</div>
          )}
        </div>
        <div className="bp__copy">
          <p className="bp__kicker">{laneLabel(lane)}</p>
          <h1 className="bp__title">{selected ? selected.title : emptyTitle(lane, folder.name)}</h1>
          <p className="bp__meta">{describeSelection(selected, folder)}</p>
          <div className="bp__actions">
            {actions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                className={[
                  action.id === 'play' ? 'btn btn--primary' : 'btn btn--ghost',
                  zone === 'actions' && focusedAction?.id === action.id && 'bp__action--pad',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={action.disabled}
                onClick={() => {
                  setZone('actions')
                  setActionIndex(index)
                  action.run()
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          {(localError || error || shelfError || folder.error) && (
            <p className="hero__error">{localError || error || shelfError || folder.error}</p>
          )}
          {folder.scanning && <p className="bp__meta">Reading folder…</p>}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const image = event.target.files?.[0]
              event.target.value = ''
              if (!image || selected?.kind !== 'shelf') return
              void onUseCover(selected.entry.id, image)
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const list = event.target.files
              event.target.value = ''
              if (list && list.length > 0) folder.adoptFiles(list)
            }}
          />
        </div>
      </div>

      {adding && lane === 'games' && (
        <div className="bp__add">
          <RomLoader
            disabled={disabled || busy}
            arcadeCore={arcadeCore}
            onArcadeCoreChange={onArcadeCoreChange}
            onFile={(files, options) => {
              void (async () => {
                await saveToLibrary(files, options)
                if (options?.system) onPlayFiles(files, options)
              })()
            }}
            onAddToLibrary={(files, options) => void saveToLibrary(files, options)}
            onDemo={onDemo}
          />
        </div>
      )}

      <div className="bp__row" role="list">
        {lane === 'games' && (
          <button type="button" className="bp__add-tile" onClick={() => setAdding(true)}>
            <span>Add</span>
          </button>
        )}
        {items.map((item) => {
          const url = covers.get(item.key)
          const active = item.key === selected?.key
          return (
            <button
              key={item.key}
              type="button"
              role="listitem"
              ref={(node) => {
                if (node) tileRefs.current.set(item.key, node)
                else tileRefs.current.delete(item.key)
              }}
              className={[
                'bp__tile',
                active && 'bp__tile--selected',
                active && zone === 'tiles' && 'bp__tile--pad',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                setSelectedKey(item.key)
                setZone('tiles')
                setConfirmRemove(false)
                if (active) void playSelected()
              }}
            >
              {url ? <img src={url} alt="" /> : <span className="bp__tile-fallback" />}
              <span className="bp__tile-title">{item.title}</span>
            </button>
          )
        })}
      </div>
      <p className="bp__hint">
        Stick or D-pad moves. South button opens. East button goes back. Up from Games reaches the page menu.
      </p>
      {viewer && <MediaStage entry={viewer} onClose={() => setViewer(null)} />}
    </section>
  )
}

function laneLabel(lane: Lane): string {
  return LANES.find((item) => item.id === lane)?.label ?? 'Library'
}

function emptyTitle(lane: Lane, folderName: string | null): string {
  if (lane === 'games') return 'Add a game'
  if (!folderName) return 'Add a folder'
  return `No ${laneLabel(lane).toLowerCase()}`
}

function describeSelection(selected: PictureItem | null, folder: MediaFolderSource): string {
  if (!selected) {
    if (folder.name) return `${folder.name} is open. Nothing in this row matched.`
    return 'Add a folder to browse games, music, videos, and photos that stay on this device.'
  }
  if (selected.kind === 'shelf') return `${SYSTEMS[selected.system].label} · saved in this browser`
  if (selected.kind === 'bundled') return `${SYSTEMS[selected.system].label} · included`
  if (selected.kind === 'folder-game') {
    return `${SYSTEMS[selected.system].label} · ${folder.name ?? 'folder'}`
  }
  return `${laneLabel(selected.media.kind === 'music' ? 'music' : selected.media.kind === 'video' ? 'video' : 'photo')} · ${selected.media.relativePath}`
}
