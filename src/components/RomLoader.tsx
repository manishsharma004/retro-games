import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ARCADE_CORE_AUTO,
  SYSTEM_GROUP_LABELS,
  SYSTEM_GROUP_ORDER,
  SYSTEMS,
  UNSUPPORTED_BROWSER_SYSTEMS,
  acceptAttribute,
  coreLabel,
  coresForSystem,
  isArcadeCoreAuto,
  previewRomFiles,
  type SystemGroup,
  type SystemId,
} from '../lib/cores'
import { prepareRomFiles } from '../lib/zipRoms'
import { ArcadeCoreSelect } from './ArcadeCoreSelect'

interface RomLoadOptions {
  arcadeCore?: string
  system?: SystemId
  core?: string
}

interface RomLoaderProps {
  disabled?: boolean
  arcadeCore: string
  onArcadeCoreChange: (core: string) => void
  onFile: (files: File[], options?: RomLoadOptions) => void
  onAddToLibrary?: (files: File[], options?: RomLoadOptions) => void
  onDemo: () => void
  compact?: boolean
}

function systemsInGroup(group: SystemGroup): SystemId[] {
  return (Object.keys(SYSTEMS) as SystemId[])
    .filter((id) => SYSTEMS[id].group === group)
    .sort((a, b) => SYSTEMS[a].label.localeCompare(SYSTEMS[b].label))
}

export function RomLoader({
  disabled,
  arcadeCore,
  onArcadeCoreChange,
  onFile,
  onAddToLibrary,
  onDemo,
  compact,
}: RomLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [files, setFiles] = useState<File[] | null>(null)
  const [systemChoice, setSystemChoice] = useState<SystemId | null>(null)
  const [coreChoice, setCoreChoice] = useState(arcadeCore)

  const preview = useMemo(() => {
    if (!files?.length) return null
    const coreOverride = systemChoice && systemChoice !== 'arcade' ? coreChoice : null
    return previewRomFiles(files, coreChoice, systemChoice, coreOverride)
  }, [files, coreChoice, systemChoice])

  const stageFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return
    const picked = [...list]
    setInspecting(true)
    setFiles(null)
    setSystemChoice(null)
    setCoreChoice(arcadeCore)
    void prepareRomFiles(picked)
      .then((next) => setFiles(next))
      .catch(() => setFiles(picked))
      .finally(() => setInspecting(false))
  }, [arcadeCore])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    stageFiles(e.dataTransfer.files)
  }

  const playStaged = () => {
    if (!files || !preview?.system) return
    if (preview.system === 'arcade') onArcadeCoreChange(coreChoice)
    onFile(files, {
      system: preview.system,
      arcadeCore: preview.system === 'arcade' ? coreChoice : undefined,
      core: preview.core,
    })
    setFiles(null)
  }

  if (compact) {
    return (
      <div className="rom-loader rom-loader--compact">
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute()}
          multiple
          hidden
          onChange={(e) => {
            const picked = e.target.files
            if (!picked?.length) return
            const list = [...picked]
            const detected = previewRomFiles(list, arcadeCore)
            onFile(list, {
              system: detected.system ?? undefined,
              arcadeCore: detected.system === 'arcade' ? arcadeCore : undefined,
            })
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn btn--primary btn--compact-load"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          title={
            isArcadeCoreAuto(arcadeCore)
              ? 'Load a ROM. Arcade zips use the automatic emulator.'
              : `Load a ROM. Arcade zips use ${coreLabel(arcadeCore)}.`
          }
        >
          Load ROM
        </button>
      </div>
    )
  }

  return (
    <div
      className={`rom-loader ${dragging ? 'rom-loader--dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute()}
        multiple
        hidden
        onChange={(e) => {
          stageFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <p className="rom-loader__hint">
        Add a ROM you own. The file type is read first, and nothing starts until you confirm it.
      </p>
      <div className="rom-loader__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </button>
        <button type="button" className="btn btn--ghost" disabled={disabled} onClick={onDemo}>
          Try demo
        </button>
      </div>
      {inspecting && <p className="rom-loader__formats">Reading the file…</p>}
      <p className="rom-loader__formats">
        Every Nostalgist core can be selected. Common cartridges are detected from the file name.
        Arcade zips marked MAME 0.37b11 need MAME 2000. Disc images that share .cue or .iso
        start as PlayStation; switch the system to Sega CD or Neo Geo CD before Play.
      </p>
      <details className="rom-loader__unsupported">
        <summary>Not available in this browser</summary>
        <p>
          These categories from ROM sites have no Nostalgist core: {UNSUPPORTED_BROWSER_SYSTEMS.join(', ')}.
        </p>
      </details>

      {preview && (
        <div className="rom-preview">
          <p className="rom-preview__files">{preview.fileNames.join(', ')}</p>
          <label className="field">
            <span>System</span>
            <select
              value={preview.system ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value as SystemId
                setSystemChoice(next)
                setCoreChoice(next === 'arcade' ? arcadeCore : SYSTEMS[next].core)
              }}
            >
              {!preview.system && <option value="">Choose a system</option>}
              {SYSTEM_GROUP_ORDER.map((group) => (
                <optgroup key={group} label={SYSTEM_GROUP_LABELS[group]}>
                  {systemsInGroup(group).map((id) => (
                    <option key={id} value={id}>
                      {SYSTEMS[id].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="rom-preview__reason">{preview.systemReason}</p>
          {preview.system === 'arcade' && (
            <label className="field">
              <span>Arcade emulator</span>
              <ArcadeCoreSelect
                value={coreChoice || ARCADE_CORE_AUTO}
                disabled={disabled}
                onChange={(core) => {
                  setCoreChoice(core)
                  onArcadeCoreChange(core)
                }}
              />
            </label>
          )}
          {preview.system && preview.system !== 'arcade' && coresForSystem(preview.system).length > 1 && (
            <label className="field">
              <span>Emulator</span>
              <select
                value={preview.core}
                disabled={disabled}
                onChange={(e) => setCoreChoice(e.target.value)}
              >
                {coresForSystem(preview.system).map((core) => (
                  <option key={core} value={core}>
                    {coreLabel(core)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {preview.coreReason && <p className="rom-preview__reason">{preview.coreReason}</p>}
          <div className="rom-loader__actions">
            {onAddToLibrary && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={disabled || !preview.system}
                onClick={() => {
                  if (!files || !preview?.system) return
                  if (preview.system === 'arcade') onArcadeCoreChange(coreChoice)
                  onAddToLibrary(files, {
                    system: preview.system,
                    arcadeCore: preview.system === 'arcade' ? coreChoice : undefined,
                    core: preview.core,
                  })
                  setFiles(null)
                }}
              >
                Add to library
              </button>
            )}
            <button
              type="button"
              className={onAddToLibrary ? 'btn btn--ghost' : 'btn btn--primary'}
              disabled={disabled || !preview.system}
              onClick={playStaged}
            >
              {onAddToLibrary ? 'Play now' : 'Play'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setFiles(null)}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
