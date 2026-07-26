import { useCallback, useRef, useState, type DragEvent } from 'react'
import { acceptAttribute } from '../lib/cores'

interface RomLoaderProps {
  disabled?: boolean
  onFile: (file: File) => void
  onDemo: () => void
  compact?: boolean
}

export function RomLoader({ disabled, onFile, onDemo, compact }: RomLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    handleFiles(e.dataTransfer.files)
  }

  if (compact) {
    return (
      <div className="rom-loader rom-loader--compact">
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute()}
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
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
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="rom-loader__hint">Drop a NES or SNES ROM here</p>
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
      <p className="rom-loader__formats">.nes · .sfc · .smc — files stay in your browser</p>
    </div>
  )
}
