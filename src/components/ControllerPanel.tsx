import type { ConnectedGamepad } from '../hooks/useGamepads'
import type { PeerSeat } from '../lib/peer/protocol'
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
  peerSeat: 1 | 2 | null
  /** Co-op: pick P1/P2 with mutual exclusion across devices. */
  remoteSeat?: PeerSeat | null
  onPickSeat?: (seat: 1 | 2) => void
  isSeatAvailable?: (seat: 1 | 2) => boolean
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
  remoteSeat = null,
  onPickSeat,
  isSeatAvailable,
}: ControllerPanelProps) {
  if (!open) return null

  const pad1Options = slotOptions(pads, true)
  const pad2Options = slotOptions(pads, true)

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

        {onPickSeat && isSeatAvailable && (
          <div className="controller-panel__seats" role="radiogroup" aria-label="Player slot">
            <p className="peer-lobby__label">Your player slot</p>
            {([1, 2] as const).map((player) => {
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
                      onChange={() => onPickSeat(player)}
                    />{' '}
                    Player {player}
                    {taken && !checked ? ' (taken)' : ''}
                  </span>
                </label>
              )
            })}
            {remoteSeat && peerSeat && remoteSeat !== peerSeat && (
              <p className="peer-lobby__hint">
                Other device is Player {remoteSeat}.
              </p>
            )}
          </div>
        )}

        <label className="controller-panel__field">
          <span>
            {peerSeat
              ? `Gamepad for Player ${peerSeat}`
              : 'Player 1 pad'}
          </span>
          <select
            value={String(bindings.pad1)}
            onChange={(e) => onChange({ ...bindings, pad1: parseSlot(e.target.value) })}
          >
            {pad1Options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {!peerSeat && (
          <label className="controller-panel__field">
            <span>Player 2 pad (same device couch co-op)</span>
            <select
              value={String(bindings.pad2)}
              onChange={(e) => onChange({ ...bindings, pad2: parseSlot(e.target.value) })}
            >
              {pad2Options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {peerSeat && !onPickSeat && (
          <p className="peer-lobby__hint">
            In a 2-player link, only your seat (P{peerSeat}) is sent to the peer. The other player
            uses their own device.
          </p>
        )}

        <div className="peer-lobby__footer">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onChange({ pad1: 'auto', pad2: 'auto' })}
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
