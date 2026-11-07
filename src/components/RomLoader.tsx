import { useCallback, useRef, useState, type DragEvent } from 'react'
import {
  acceptAttribute,
  coreLabel,
  filesIncludeZip,
  formatExtensionsHint,
  isArcadeCoreAuto,
  resolveArcadeCoreForFiles,
} from '../lib/cores'
import { ArcadeCoreSelect } from './ArcadeCoreSelect'

interface RomLoaderProps {
  disabled?: boolean
  arcadeCore: string
  onArcadeCoreChange: (core: string) => void
  onFile: (files: File[], options?: { arcadeCore?: string }) => void
  onDemo: () => void
  compact?: boolean
}

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
  const [autoPick, setAutoPick] = useState<string | null>(null)

  const launchFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return
      const list = [...files]
      if (filesIncludeZip(list)) {
        const { core, auto, sourceRom } = resolveArcadeCoreForFiles(list, arcadeCore)
        if (auto && sourceRom) {
          setAutoPick(`${sourceRom} → ${coreLabel(core)}`)
        } else if (auto) {
          setAutoPick(`Auto → ${coreLabel(core)}`)
        } else {
          setAutoPick(null)
        }
        onFile(list, { arcadeCore })
      } else {
        setAutoPick(null)
        onFile(list)
      }
    },
    [arcadeCore, onFile],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    launchFiles(e.dataTransfer.files)
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
          onChange={(e) => launchFiles(e.target.files)}
        />
        <button
          type="button"
          className="btn btn--primary btn--compact-load"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          title={
            isArcadeCoreAuto(arcadeCore)
              ? 'Load ROM (core: Auto) — change in Advanced settings'
              : `Load ROM (core: ${coreLabel(arcadeCore)}) — change in Advanced settings`
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
        onChange={(e) => launchFiles(e.target.files)}
      />
      <p className="rom-loader__hint">Drop a ROM you own, or browse for a file.</p>
      <div className="rom-loader__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Load ROM
        </button>
        <button type="button" className="btn btn--ghost" disabled={disabled} onClick={onDemo}>
          Try demo
        </button>
      </div>
      <p className="rom-loader__formats">{formatExtensionsHint()}</p>
      <details className="rom-loader__advanced">
        <summary>Arcade and multi-file ROMs</summary>
        <label className="field rom-loader__core">
          <span>Emulator core for .zip ROMs</span>
          <ArcadeCoreSelect
            value={arcadeCore}
            disabled={disabled}
            onChange={(core) => {
              setAutoPick(null)
              onArcadeCoreChange(core)
            }}
          />
        </label>
        {autoPick && isArcadeCoreAuto(arcadeCore) && (
          <p className="rom-loader__formats rom-loader__formats--sub">
            Auto-selected core: <strong>{autoPick}</strong>
          </p>
        )}
        <p className="rom-loader__formats rom-loader__formats--sub">
          The zip name has to match the ROM set (for example <code>pacman.zip</code>). Select the
          game zip together with its parent or BIOS zips. KOV2 / PGM games use FB Alpha 2012 plus{' '}
          <code>pgm.zip</code>. A black screen usually means the core does not match the set.
        </p>
      </details>
    </div>
  )
}
