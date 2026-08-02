import type { ConnectedGamepad } from '../hooks/useGamepads'
import type { PeerSeat } from '../lib/peer/protocol'
import type { MaxPlayers } from '../lib/peer/roster'
import { playerSeats } from '../lib/peer/roster'
import {
  shortGamepadName,
  type ControllerBindings,
  type PadSlot,
} from '../lib/gamepad'

interface ControllerPanelProps {
  open: boolean
  onClose: () => void
  pads: ConnectedGamepad[]
  bindings: ControllerBindings
  onChange: (next: ControllerBindings) => void
  peerSeat: PeerSeat | null
  maxLocalSeats?: MaxPlayers
  /** Co-op: pick P1/P2 with mutual exclusion across devices. */
  remoteSeat?: PeerSeat | null
  onPickSeat?: (seat: PeerSeat) => void
  onPickRole?: (seat: PeerSeat | null) => void
  isSeatAvailable?: (seat: PeerSeat) => boolean
  remoteSpectator?: boolean
  multiGuest?: boolean
  maxPlayers?: MaxPlayers
}

function slotOptions(
  pads: ConnectedGamepad[],
  includeAuto: boolean,
): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = []
  if (includeAuto) opts.push({ value: 'auto', label: 'Auto (next free pad)' })
  opts.push({ value: 'none', label: 'None' })
  for (const pad of pads) {
    opts.push({
      value: String(pad.index),
      label: `#${pad.index} · ${shortGamepadName(pad.id)}`,
    })
  }
  return opts
}

function parseSlot(value: string): PadSlot {
  if (value === 'auto' || value === 'none') return value
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : 'none'
}

export function ControllerPanel({
  open,
  onClose,
  pads,
  bindings,
  onChange,
  peerSeat,
  maxLocalSeats = 2,
  remoteSeat = null,
  onPickSeat,
  onPickRole,
  isSeatAvailable,
  remoteSpectator = false,
  multiGuest = false,
  maxPlayers = 2,
}: ControllerPanelProps) {
  if (!open) return null

  const pickRoleFn = onPickRole ?? onPickSeat
  const seatPickerSeats = playerSeats(multiGuest ? maxPlayers : 2)
  const padOptions = slotOptions(pads, true)
  const showLocalPads = peerSeat === null
  const localSeats = playerSeats(maxLocalSeats)

  return (
    <div className="peer-lobby" role="dialog" aria-modal="true" aria-label="Controllers">
      <div className="peer-lobby__panel controller-panel">
        <header className="peer-lobby__header">
          <h2>Controllers</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="peer-lobby__lead">
          Pick which physical gamepad drives each seat. Controllers are polled in the browser and
          routed through the same input path as the keyboard and on-screen pad (required for 2-player
          peer sync).
        </p>

        {pads.length === 0 ? (
          <p className="peer-lobby__hint">
            No controller detected yet. Press a button on the pad (browsers only expose pads after a
            gesture), then check again.
          </p>
        ) : (
          <ul className="controller-panel__list">
            {pads.map((pad) => (
              <li key={pad.index}>
                <strong>#{pad.index}</strong> {shortGamepadName(pad.id)}
                <span className="controller-panel__meta">
                  {pad.mapping || 'no mapping'} · {pad.buttons} buttons
                </span>
              </li>
            ))}
          </ul>
        )}

        {pickRoleFn && isSeatAvailable && (
          <div className="controller-panel__seats" role="radiogroup" aria-label="Player slot">
            <p className="peer-lobby__label">Your role</p>
            {seatPickerSeats.map((player) => {
              const taken = !isSeatAvailable(player)
              const checked = peerSeat === player
              return (
                <label key={player} className="controller-panel__field">
                  <span>
                    <input
                      type="radio"
                      name="controller-player-slot"
                      checked={checked}
                      disabled={taken && !checked}
                      onChange={() => pickRoleFn(player)}
                    />{' '}
                    Player {player}
                    {taken && !checked ? ' (taken)' : ''}
                  </span>
                </label>
              )
            })}
            {onPickRole && (
              <label className="controller-panel__field">
                <span>
                  <input
                    type="radio"
                    name="controller-player-slot"
                    checked={peerSeat === null}
                    onChange={() => onPickRole(null)}
                  />{' '}
                  Spectator
                </span>
              </label>
            )}
            {!multiGuest && remoteSeat && peerSeat && remoteSeat !== peerSeat && (
              <p className="peer-lobby__hint">
                Other device is Player {remoteSeat}.
              </p>
            )}
            {!multiGuest && remoteSpectator && peerSeat !== null && (
              <p className="peer-lobby__hint">Other device is spectating.</p>
            )}
          </div>
        )}

        {(showLocalPads ? localSeats : peerSeat ? [peerSeat] : []).map((seat) => {
          const padKey = `pad${seat}` as keyof ControllerBindings
          return (
          <label key={seat} className="controller-panel__field">
            <span>
              {peerSeat ? `Gamepad for Player ${peerSeat}` : `Player ${seat} pad`}
            </span>
            <select
              value={String(bindings[padKey])}
              onChange={(e) =>
                onChange({ ...bindings, [padKey]: parseSlot(e.target.value) })
              }
            >
              {padOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          )
        })}

        {peerSeat && !pickRoleFn && (
          <p className="peer-lobby__hint">
            In a peer link, only your seat (P{peerSeat}) is sent to the host. Other players use their
            own devices.
          </p>
        )}

        <div className="peer-lobby__footer">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              onChange({
                pad1: 'auto',
                pad2: 'auto',
                pad3: 'auto',
                pad4: 'none',
                pad5: 'none',
              })
            }
          >
            Reset to auto
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
