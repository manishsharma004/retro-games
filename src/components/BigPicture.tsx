import { useEffect, useMemo, useRef, useState } from 'react'
import { renderCover } from '../lib/coverArt'
import { SYSTEMS, type SystemId } from '../lib/cores'
import type { LibraryRom } from '../lib/library'
import { readShelfFiles, type ShelfSummary } from '../lib/romShelf'
import { RomLoader } from './RomLoader'

interface RomLaunchOptions {
  arcadeCore?: string
  system?: SystemId
  core?: string
}

interface BigPictureProps {
  bundled: LibraryRom[]
  imported: ShelfSummary[]
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
}

type PictureItem =
  | { key: string; title: string; system: SystemId; kind: 'bundled'; rom: LibraryRom }
  | { key: string; title: string; system: SystemId; kind: 'shelf'; entry: ShelfSummary }

export function BigPicture({
  bundled,
  imported,
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
}: BigPictureProps) {
  const [adding, setAdding] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const tileRefs = useRef(new Map<string, HTMLButtonElement>())
  const coverUrlsRef = useRef<string[]>([])

  const items = useMemo<PictureItem[]>(() => {
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
    return [...shelfItems, ...bundledItems]
  }, [bundled, imported])

  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null

  useEffect(() => {
    if (!focusId) return
    setSelectedKey(`shelf:${focusId}`)
    setAdding(false)
  }, [focusId])

  useEffect(() => {
    if (!selected) return
    tileRefs.current.get(selected.key)?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selected])

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
          item.kind === 'shelf' ? item.entry.cover : await renderCover(item.title, item.system)
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
    return () => {
      coverUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const move = (delta: number) => {
    if (items.length === 0) return
    const index = Math.max(0, items.findIndex((item) => item.key === selected?.key))
    const next = items[(index + delta + items.length) % items.length]
    setSelectedKey(next.key)
    setConfirmRemove(false)
  }

  useEffect(() => {
    if (adding) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, select, textarea')) return
      if (event.key === 'Enter' && target instanceof HTMLElement && target.closest('button')) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        move(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        move(-1)
      } else if (event.key === 'Enter' && selected) {
        event.preventDefault()
        void playSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // playSelected closes over the latest selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, selected, items, disabled, busy])

  useEffect(() => {
    if (adding) return
    let frame = 0
    let lastPad = 0
    const tick = () => {
      const pads = navigator.getGamepads?.() ?? []
      const pad = [...pads].find((item) => item && item.connected)
      if (pad && performance.now() - lastPad > 220) {
        const left = pad.buttons[14]?.pressed || pad.axes[0] < -0.6
        const right = pad.buttons[15]?.pressed || pad.axes[0] > 0.6
        const play = pad.buttons[0]?.pressed
        if (left || right || play) {
          lastPad = performance.now()
          if (left) move(-1)
          else if (right) move(1)
          else if (play && selected) void playSelected()
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, selected, items, disabled, busy])

  const playSelected = async () => {
    if (!selected || disabled || busy) return
    setLocalError(null)
    if (selected.kind === 'bundled') {
      onPlayBundled(selected.rom)
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

  const coverUrl = selected ? covers.get(selected.key) : null

  return (
    <section className="bp" aria-label="Library">
      <div className="bp__stage">
        <div className="bp__hero-cover">
          {coverUrl ? (
            <img src={coverUrl} alt="" />
          ) : (
            <div className="bp__hero-empty">{selected ? SYSTEMS[selected.system].label : 'Add a game'}</div>
          )}
        </div>
        <div className="bp__copy">
          <p className="bp__kicker">Library</p>
          <h1 className="bp__title">{selected ? selected.title : 'Add a ROM'}</h1>
          <p className="bp__meta">
            {selected
              ? `${SYSTEMS[selected.system].label}${selected.kind === 'shelf' ? ' · saved in this browser' : ' · included'}`
              : 'Imported games stay in this browser. A cover is drawn from the title, or you can use your own image.'}
          </p>
          <div className="bp__actions">
            {selected && (
              <button type="button" className="btn btn--primary" disabled={disabled || busy} onClick={() => void playSelected()}>
                Play
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => setAdding((open) => !open)}>
              {adding ? 'Close' : 'Add ROM'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={disabled} onClick={onDemo}>
              Try demo
            </button>
            {selected?.kind === 'shelf' && (
              <>
                <button type="button" className="btn btn--ghost" onClick={() => coverInputRef.current?.click()}>
                  Use a cover
                </button>
                {selected.entry.coverKind === 'custom' && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void onRegenerateCover(selected.entry.id)}
                  >
                    Generate cover
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    if (!confirmRemove) {
                      setConfirmRemove(true)
                      return
                    }
                    void onRemove(selected.entry.id)
                    setConfirmRemove(false)
                  }}
                >
                  {confirmRemove ? 'Confirm remove' : 'Remove'}
                </button>
              </>
            )}
          </div>
          {(localError || error || shelfError) && <p className="hero__error">{localError || error || shelfError}</p>}
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
        </div>
      </div>

      {adding && (
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
        <button type="button" className="bp__add-tile" onClick={() => setAdding(true)}>
          <span>Add</span>
        </button>
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
              className={active ? 'bp__tile bp__tile--selected' : 'bp__tile'}
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                setSelectedKey(item.key)
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
      <p className="bp__hint">Left and right move through the row. Enter or the bottom face button plays.</p>
    </section>
  )
}
