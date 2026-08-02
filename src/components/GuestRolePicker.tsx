import type { UsePeerSessionResult } from '../hooks/usePeerSession'
import type { PeerSeat } from '../lib/peer/protocol'
import { playerSeats } from '../lib/peer/roster'

export interface GuestRolePickerProps {
  peer: Pick<
    UsePeerSessionResult,
    'multiGuest' | 'maxPlayers' | 'seat' | 'isSeatAvailable' | 'pickRole' | 'remoteSeat' | 'remoteSpectator'
  >
  name: string
  /** When set, drives selection locally before the peer session is connected. */
  value?: PeerSeat | null
  onChange?: (seat: PeerSeat | null) => void
  className?: string
  compact?: boolean
}

export function GuestRolePicker({
  peer,
  name,
  value,
  onChange,
  className,
  compact = false,
}: GuestRolePickerProps) {
  const seats = playerSeats(peer.multiGuest ? peer.maxPlayers : 2)
  const selected = value !== undefined ? value : peer.seat
  const pick = onChange ?? ((seat: PeerSeat | null) => peer.pickRole(seat))

  const guestSeats = peer.multiGuest ? seats : seats.filter((s) => s !== 1)

  return (
    <div
      className={['join-page__seats', compact && 'join-page__seats--compact', className]
        .filter(Boolean)
        .join(' ')}
      role="radiogroup"
      aria-label="Your role"
    >
      <p className="join-page__label">Your role</p>
      {guestSeats.map((player) => {
        const taken = !peer.isSeatAvailable(player)
        const checked = selected === player
        return (
          <label key={player} className="join-page__seat">
            <input
              type="radio"
              name={name}
              checked={checked}
              disabled={taken && !checked}
              onChange={() => pick(player)}
            />
            <span>
              Player {player}
              {checked ? ' (you)' : ''}
              {taken && !checked ? ' (taken)' : ''}
            </span>
          </label>
        )
      })}
      <label className="join-page__seat">
        <input
          type="radio"
          name={name}
          checked={selected === null}
          onChange={() => pick(null)}
        />
        <span>Spectator{selected === null ? ' (you)' : ''}</span>
      </label>
      {!peer.multiGuest && peer.remoteSeat && selected && peer.remoteSeat !== selected && (
        <p className="join-page__hint">Host is Player {peer.remoteSeat}.</p>
      )}
      {!peer.multiGuest && peer.remoteSpectator && selected !== null && (
        <p className="join-page__hint">Host is spectating.</p>
      )}
    </div>
  )
}
