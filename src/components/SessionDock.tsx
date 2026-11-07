import { useState } from 'react'
import type { SessionMode } from '../lib/peer/protocol'
import type { PeerPhase } from '../hooks/usePeerSession'
import type { PeerSeat } from '../lib/peer'

const MODE_LABEL: Record<SessionMode, string> = {
  local: 'Couch',
  remote: 'Remote',
  coop: 'Co-op',
}

interface SessionDockProps {
  mode: SessionMode
  phase: PeerPhase
  roomCode: string | null
  joinUrl: string | null
  seat: PeerSeat | null
  guests: number
  lost: boolean
  onOpen: () => void
  onLeave: () => void
}

/** Compact session controls while a game is running. */
export function SessionDock({
  mode,
  phase,
  roomCode,
  joinUrl,
  seat,
  guests,
  lost,
  onOpen,
  onLeave,
}: SessionDockProps) {
  const [note, setNote] = useState<string | null>(null)

  async function copyLink() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setNote('Link copied')
    } catch {
      setNote('Copy failed')
    }
  }

  const who = seat === null ? 'Watching' : `P${seat}`
  const status = lost ? 'Reconnecting' : phase === 'playing' ? 'Live' : phase.replace('-', ' ')

  return (
    <div className="session-dock" aria-label="Multiplayer session">
      <p className="session-dock__summary">
        <strong>{MODE_LABEL[mode]}</strong>
        {roomCode ? <span className="session-dock__code">{roomCode}</span> : null}
        <span>{who}</span>
        <span>
          {guests} guest{guests === 1 ? '' : 's'}
        </span>
        <span>{status}</span>
      </p>
      <div className="session-dock__actions">
        {joinUrl && (
          <button type="button" className="btn btn--ghost btn--toolbar" onClick={() => void copyLink()}>
            Copy link
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--toolbar" onClick={onOpen}>
          Session
        </button>
        <button type="button" className="btn btn--ghost btn--toolbar" onClick={onLeave}>
          Leave
        </button>
      </div>
      {note && <p className="session-dock__note">{note}</p>}
    </div>
  )
}
