import { useEffect, useRef, useState } from 'react'
import type { ConnectedGamepad } from '../hooks/useGamepads'
import type { RetroPadButton } from '../lib/keyboard'
import type { PeerSeat } from '../lib/peer/protocol'
import type { MaxPlayers } from '../lib/peer/roster'
import { playerSeats } from '../lib/peer/roster'
import {
  friendlyPadName,
  padProfile,
  padProfileLabel,
  readRetroButtons,
  type ControllerBindings,
  type PadSlot,
  type PlayerSeat,
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
  /** Live input remap. Bottom face (Xbox A / Cross) becomes jump when on. */
  swapAB?: boolean
  onSwapAB?: (value: boolean) => void
  swapLocked?: boolean
  /** Render in the page instead of a modal. */
  embedded?: boolean
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
      label: `${friendlyPadName(pad.id)} · #${pad.index}`,
    })
  }
  return opts
}

function parseSlot(value: string): PadSlot {
  if (value === 'auto' || value === 'none') return value
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : 'none'
}

const FACE_TEST: Array<{ id: RetroPadButton; label: string }> = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'y', label: 'Y' },
  { id: 'x', label: 'X' },
  { id: 'b', label: 'B' },
  { id: 'a', label: 'A' },
  { id: 'l', label: 'L' },
  { id: 'r', label: 'R' },
  { id: 'select', label: 'Select' },
  { id: 'start', label: 'Start' },
]

function sameLive(
  prev: Record<number, RetroPadButton[]>,
  next: Record<number, RetroPadButton[]>,
): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return false
  for (const key of nextKeys) {
    const left = prev[Number(key)]
    const right = next[Number(key)]
    if (!left || left.length !== right.length) return false
    for (let i = 0; i < right.length; i += 1) {
      if (left[i] !== right[i]) return false
    }
  }
  return true
}

function toGameButton(button: RetroPadButton, swap: boolean): RetroPadButton {
  if (!swap) return button
  if (button === 'a') return 'b'
  if (button === 'b') return 'a'
  if (button === 'x') return 'y'
  if (button === 'y') return 'x'
  return button
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
  swapAB = false,
  onSwapAB,
  swapLocked = false,
  embedded = false,
}: ControllerPanelProps) {
  const [live, setLive] = useState<Record<number, RetroPadButton[]>>({})
  const [assigning, setAssigning] = useState<PlayerSeat | null>(null)
  const armedRef = useRef(false)
  const prevActiveRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!open) {
      setAssigning(null)
      return
    }
    let raf = 0
    const tick = () => {
      const padsNow = navigator.getGamepads?.() ?? []
      const next: Record<number, RetroPadButton[]> = {}
      const active = new Set<number>()
      for (const pad of padsNow) {
        if (!pad) continue
        const buttons = [...readRetroButtons(pad)]
        next[pad.index] = buttons
        if (buttons.length > 0) active.add(pad.index)
      }
      setLive((prev) => (sameLive(prev, next) ? prev : next))

      if (assigning !== null) {
        if (!armedRef.current) {
          if (active.size === 0) armedRef.current = true
        } else {
          for (const index of active) {
            if (!prevActiveRef.current.has(index)) {
              const padKey = `pad${assigning}` as keyof ControllerBindings
              onChange({ ...bindings, [padKey]: index })
              setAssigning(null)
              armedRef.current = false
              break
            }
          }
        }
      }
      prevActiveRef.current = active
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, assigning, bindings, onChange])

  if (!open) return null

  const pickRoleFn = onPickRole ?? onPickSeat
  const seatPickerSeats = playerSeats(multiGuest ? maxPlayers : 2)
  const padOptions = slotOptions(pads, true)
  const showLocalPads = peerSeat === null
  const localSeats = playerSeats(maxLocalSeats)

  return (
    <div
      className={embedded ? 'peer-lobby peer-lobby--embedded' : 'peer-lobby'}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="Controllers"
    >
      <div className="peer-lobby__panel controller-panel">
        <header className="peer-lobby__header">
          <h2>Controllers</h2>
          {!embedded && (
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
          )}
        </header>

        <p className="peer-lobby__lead">
          Xbox and PlayStation pads use the same face positions: bottom is B, right is A, left is Y,
          top is X. Press a button to see it light up.
        </p>

        {onSwapAB && (
          <label className="field field--row controller-panel__swap">
            <span>Bottom button jumps (Xbox A / Cross)</span>
            <input
              type="checkbox"
              checked={swapAB}
              disabled={swapLocked}
              onChange={(e) => onSwapAB(e.target.checked)}
            />
          </label>
        )}
        {swapAB && (
          <p className="peer-lobby__hint">
            Swap is on, so the bottom face button is A (jump) and the right face button is B.
          </p>
        )}

        {pads.length === 0 ? (
          <p className="peer-lobby__hint">
            No controller yet. Press any face button — browsers hide pads until the first press.
          </p>
        ) : (
          <ul className="controller-panel__list">
            {pads.map((pad) => {
              const profile = padProfile(pad.id, pad.mapping)
              const held = new Set((live[pad.index] ?? []).map((button) => toGameButton(button, swapAB)))
              return (
                <li key={`${pad.index}-${pad.id}`}>
                  <strong>
                    {friendlyPadName(pad.id)} · #{pad.index}
                  </strong>
                  <span className="controller-panel__meta">
                    {padProfileLabel(profile)}
                    {pad.mapping === 'standard' ? '' : ' · browser did not remap this pad'}
                  </span>
                  <span className="controller-panel__tester" aria-label="Buttons held on this controller">
                    {FACE_TEST.map((button) => (
                      <span
                        key={button.id}
                        className={`controller-panel__key ${held.has(button.id) ? 'controller-panel__key--down' : ''}`}
                      >
                        {button.label}
                      </span>
                    ))}
                  </span>
                </li>
              )
            })}
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
            <div key={seat} className="controller-panel__field">
              <span>{peerSeat ? `Gamepad for Player ${peerSeat}` : `Player ${seat} pad`}</span>
              <div className="controller-panel__assign">
                <select
                  value={String(bindings[padKey])}
                  onChange={(e) => onChange({ ...bindings, [padKey]: parseSlot(e.target.value) })}
                >
                  {padOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    armedRef.current = false
                    setAssigning(seat)
                  }}
                >
                  {assigning === seat ? 'Press a button…' : 'Press to assign'}
                </button>
              </div>
            </div>
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
