import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ARCADE_CORE_AUTO,
  PRIMARY_ROM_SYSTEMS,
  SYSTEMS,
  acceptAttribute,
  coreLabel,
  isArcadeCoreAuto,
  previewRomFiles,
  type SystemId,
} from '../lib/cores'
import { ArcadeCoreSelect } from './ArcadeCoreSelect'

interface RomLoadOptions {
  arcadeCore?: string
  system?: SystemId
}

interface RomLoaderProps {
  disabled?: boolean
  arcadeCore: string
  onArcadeCoreChange: (core: string) => void
  onFile: (files: File[], options?: RomLoadOptions) => void
  onDemo: () => void
  compact?: boolean
}

const SYSTEM_OPTIONS: SystemId[] = [
  ...PRIMARY_ROM_SYSTEMS,
  ...(Object.keys(SYSTEMS) as SystemId[]).filter((id) => !PRIMARY_ROM_SYSTEMS.includes(id)),
]

export function RomLoader({
  disabled,
  arcadeCore,
  onArcadeCoreChange,
  onFile,
  onDemo,
  compact,
}: RomLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<File[] | null>(null)
  const [systemChoice, setSystemChoice] = useState<SystemId | null>(null)
  const [coreChoice, setCoreChoice] = useState(arcadeCore)

  const preview = useMemo(() => {
    if (!files?.length) return null
    return previewRomFiles(files, coreChoice, systemChoice)
  }, [files, coreChoice, systemChoice])

  const stageFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return
    const next = [...list]
    setFiles(next)
    setSystemChoice(null)
    setCoreChoice(arcadeCore)
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
      <p className="rom-loader__formats">NES, SNES, Game Boy, Genesis, PlayStation, and arcade zips.</p>

      {preview && (
        <div className="rom-preview">
          <p className="rom-preview__files">{preview.fileNames.join(', ')}</p>
          <label className="field">
            <span>System</span>
            <select
              value={preview.system ?? ''}
              disabled={disabled || !preview.system}
              onChange={(e) => setSystemChoice(e.target.value as SystemId)}
            >
              {!preview.system && <option value="">Unrecognized</option>}
              {SYSTEM_OPTIONS.map((id) => (
                <option key={id} value={id}>
                  {SYSTEMS[id].label}
                </option>
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
          {preview.coreReason && <p className="rom-preview__reason">{preview.coreReason}</p>}
          <div className="rom-loader__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={disabled || !preview.system}
              onClick={playStaged}
            >
              Play
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
