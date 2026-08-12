import { useCallback, useRef, useState, type DragEvent } from 'react'
import {
  ARCADE_CORES,
  acceptAttribute,
  filesIncludeZip,
  formatExtensionsHint,
} from '../lib/cores'

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

  const launchFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return
      const list = [...files]
      onFile(list, filesIncludeZip(list) ? { arcadeCore } : undefined)
    },
    [arcadeCore, onFile],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    launchFiles(e.dataTransfer.files)
  }

  const arcadeHint = ARCADE_CORES.find((c) => c.id === arcadeCore)?.romHint

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
        <label className="field rom-loader__core">
          <span>Arcade core</span>
          <select
            value={arcadeCore}
            disabled={disabled}
            onChange={(e) => onArcadeCoreChange(e.target.value)}
          >
            {ARCADE_CORES.map((core) => (
              <option key={core.id} value={core.id}>
                {core.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
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
      <p className="rom-loader__hint">Drop a ROM here — NES, SNES, Game Boy, Genesis, PSX, arcade (.zip), and more</p>
      <label className="field rom-loader__core">
        <span>Arcade / .zip core</span>
        <select
          value={arcadeCore}
          disabled={disabled}
          onChange={(e) => onArcadeCoreChange(e.target.value)}
        >
          {ARCADE_CORES.map((core) => (
            <option key={core.id} value={core.id}>
              {core.label}
            </option>
          ))}
        </select>
      </label>
      {arcadeHint ? (
        <p className="rom-loader__formats rom-loader__formats--sub">
          {arcadeHint}. Zip name must match the set (e.g. <code>pacman.zip</code>). Try another core if
          you only get a black screen.
        </p>
      ) : null}
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
      <p className="rom-loader__formats rom-loader__formats--sub">
        Arcade: select game + parent/BIOS zips together. MAME cores want all zips in one folder; FBNeo
        Neo Geo wants <code>neogeo.zip</code> alongside the game.
      </p>
    </div>
  )
}
