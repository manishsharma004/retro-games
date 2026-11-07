import { useEffect, useState } from 'react'
import type { MediaEntry } from '../lib/mediaFolder'

interface MediaStageProps {
  entry: MediaEntry
  onClose: () => void
}

/** Full-screen player for a music track, video, or photo from the user's folder. */
export function MediaStage({ entry, onClose }: MediaStageProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const next = URL.createObjectURL(entry.file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [entry])

  return (
    <div className="media-stage" role="dialog" aria-label={entry.name}>
      <div className="media-stage__bar">
        <p className="media-stage__title">{entry.name}</p>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {url && entry.kind === 'photo' && <img className="media-stage__photo" src={url} alt={entry.name} />}
      {url && entry.kind === 'video' && <video className="media-stage__video" src={url} controls autoPlay />}
      {url && entry.kind === 'music' && (
        <div className="media-stage__music">
          <p>{entry.relativePath}</p>
          <audio src={url} controls autoPlay />
        </div>
      )}
      <p className="media-stage__hint">East face button or Close leaves the player. Left and right change the item.</p>
    </div>
  )
}
