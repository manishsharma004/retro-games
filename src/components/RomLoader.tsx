import { useCallback, useRef, useState, type DragEvent } from 'react'
import {
  NOSTALGIST_CORES,
  acceptAttribute,
  arcadeCoreOptionLabel,
  coreLabel,
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
          title={`Load ROM (core: ${coreLabel(arcadeCore)}) — change in Advanced settings`}
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
        <span>Emulator core for .zip ROMs</span>
        <select
          value={arcadeCore}
          disabled={disabled}
          onChange={(e) => onArcadeCoreChange(e.target.value)}
        >
          {NOSTALGIST_CORES.map((core) => (
            <option key={core.id} value={core.id}>
              {arcadeCoreOptionLabel(core)}
            </option>
          ))}
        </select>
      </label>
      <p className="rom-loader__formats rom-loader__formats--sub">
        Pick the core that matches your ROM set. Zip name must match the set (e.g.{' '}
        <code>pacman.zip</code>). Black screen → try MAME 2003-Plus, FBNeo Neo Geo, or FBNeo CPS-1/2.
      </p>
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
