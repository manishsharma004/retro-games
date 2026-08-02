import { useEffect, useRef, useState } from 'react'
import { LatencyBadge } from '../components/LatencyBadge'
import { PeerConnectionStatus } from '../components/PeerConnectionStatus'
import { RemotePlayGuestView } from '../components/RemotePlayGuestView'
import { VirtualController } from '../components/VirtualController'
import { usePeerSession } from '../hooks/usePeerSession'
import { useLocalGuest } from '../hooks/multiplayer/useLocalGuest'
import { useRemoteGuest } from '../hooks/multiplayer/useRemoteGuest'
import {
  buildJoinUrl,
  normalizeRoomCode,
  parseJoinLocation,
  type JoinRole,
  type SessionMode,
} from '../lib/peer'
import { DEFAULT_LAYOUT } from '../lib/virtualLayout'
import { playerSeats } from '../lib/peer/roster'
import { loadSettings } from '../lib/settings'
import '../styles/app.css'

interface JoinPageProps {
  initialRoom: string
  initialMode: SessionMode
  initialRole?: JoinRole
}

function RolePicker({
  peer,
  name,
}: {
  peer: ReturnType<typeof usePeerSession>
  name: string
}) {
  if (peer.connectionState !== 'connected' && !(peer.multiGuest && peer.role === 'guest')) return null

  const seats = playerSeats(peer.multiGuest ? peer.maxPlayers : 2)

  return (
    <div className="join-page__seats" role="radiogroup" aria-label="Your role">
      <p className="join-page__label">Your role</p>
      {seats.map((player) => {
        const taken = !peer.isSeatAvailable(player)
        const checked = peer.seat === player
        return (
          <label key={player} className="join-page__seat">
            <input
              type="radio"
              name={name}
              checked={checked}
              disabled={taken && !checked}
              onChange={() => peer.pickRole(player)}
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
          checked={peer.seat === null}
          onChange={() => peer.pickRole(null)}
        />
        <span>Spectator{peer.seat === null ? ' (you)' : ''}</span>
      </label>
      {peer.remoteSeat && peer.seat && !peer.multiGuest && peer.remoteSeat !== peer.seat && (
        <p className="join-page__hint">Other device is Player {peer.remoteSeat}.</p>
      )}
      {!peer.multiGuest && peer.remoteSpectator && peer.seat !== null && (
        <p className="join-page__hint">Other device is spectating.</p>
      )}
    </div>
  )
}

export function JoinPage({ initialRoom, initialMode, initialRole = 'player' }: JoinPageProps) {
  const [mode] = useState<SessionMode>(initialMode)
  const [roomInput, setRoomInput] = useState(initialRoom)
  const [joinAsSpectator, setJoinAsSpectator] = useState(initialRole === 'spectator')
  const [joined, setJoined] = useState(Boolean(initialRoom))
  const joinStartedRef = useRef(false)

  const peer = usePeerSession({
    settings: loadSettings(),
    sessionMode: mode,
    onRemoteInput: () => {},
    onGo: () => {},
  })

  const localGuest = useLocalGuest({
    enabled: mode === 'local' && joined,
    peer,
  })

  const remoteGuest = useRemoteGuest({
    enabled: mode === 'remote' && joined,
    peer,
  })

  useEffect(() => {
    if (!joined || !roomInput.trim() || joinStartedRef.current) return
    joinStartedRef.current = true
    void peer.joinWithRoomCode(roomInput.trim(), mode, { asSpectator: joinAsSpectator })
  }, [joined, roomInput, mode, joinAsSpectator, peer.joinWithRoomCode])

  if (mode === 'local') {
    return (
      <div className="join-page join-page--controller">
        <header className="join-page__header">
          <h1>
            {peer.seat === null ? 'Spectator' : `Player ${localGuest.seat ?? peer.seat ?? '—'}`}
          </h1>
          <p className="join-page__status">
            {peer.phase === 'connecting' && 'Connecting to room…'}
            {peer.phase === 'guest-answer' && 'Waiting for host to accept…'}
            {peer.connectionState === 'connected' && 'Connected'}
            {peer.connectionLost && 'Connection lost'}
            {peer.connectionState !== 'connected' &&
              !peer.connectionLost &&
              peer.phase !== 'connecting' &&
              peer.phase !== 'guest-answer' &&
              'Not connected'}
            {peer.signalingLabel ? ` · ${peer.signalingLabel}` : ''}
            {peer.connectionState === 'connected' && (
              <>
                {' '}
                · <LatencyBadge profile={peer.latencyProfile} connected showAdvice />
              </>
            )}
          </p>
        </header>
        {!joined ? (
          <div className="join-page__form">
            <label>
              Room code
              <input
                className="join-page__input"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                placeholder="5829"
                maxLength={6}
              />
            </label>
            <div className="join-page__seats" role="radiogroup" aria-label="Join role">
              <label className="join-page__seat">
                <input
                  type="radio"
                  name="local-join-role"
                  checked={!joinAsSpectator}
                  onChange={() => setJoinAsSpectator(false)}
                />
                <span>Join as controller</span>
              </label>
              <label className="join-page__seat">
                <input
                  type="radio"
                  name="local-join-role"
                  checked={joinAsSpectator}
                  onChange={() => setJoinAsSpectator(true)}
                />
                <span>Join as spectator</span>
              </label>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!roomInput.trim()}
              onClick={() => setJoined(true)}
            >
              Join room
            </button>
            {peer.error && <p className="join-page__error">{peer.error}</p>}
          </div>
        ) : (
          <>
            <PeerConnectionStatus
              variant="inline"
              requireVideo={false}
              roomCode={roomInput.trim()}
              phase={peer.phase}
              connectionState={peer.connectionState}
              connectionLost={peer.connectionLost}
              error={peer.error}
              onReconnect={() => peer.reconnectSession()}
              onLeave={() => {
                joinStartedRef.current = false
                peer.disconnect()
                setJoined(false)
              }}
            />
            <RolePicker peer={peer} name="join-local-role" />
            {(peer.connectionLost || peer.error) && (
              <div className="join-page__row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void peer.reconnectSession()}
                >
                  Reconnect
                </button>
              </div>
            )}
            {peer.seat !== null && (
              <VirtualController
                system="nes"
                onPress={localGuest.onPress}
                onRelease={localGuest.onRelease}
                visible
                dpadMode="dpad"
                overlay={false}
                size="large"
                scaleBoost={1.2}
                opacity={0.92}
                layout={DEFAULT_LAYOUT}
              />
            )}
          </>
        )}
        {joined && peer.error && <p className="join-page__error">{peer.error}</p>}
      </div>
    )
  }

  if (mode === 'remote') {
    if (joined) {
      return (
        <RemotePlayGuestView
          peer={peer}
          remoteGuest={remoteGuest}
          roomCode={roomInput.trim()}
          onLeave={() => {
            joinStartedRef.current = false
            setJoined(false)
          }}
        />
      )
    }

    return (
      <div className="app join-page join-page--remote-lobby">
        <div className="atmosphere" aria-hidden="true" />
        <header className="hero hero--compact">
          <p className="hero__brand">Retro Games</p>
          <h1 className="hero__tagline">Remote play</h1>
          <p className="hero__sub">
            Watch the host&apos;s screen and control the game from this device.
          </p>
          <div className="join-page__form join-page__form--hero">
            <label className="field">
              <span>Room code</span>
              <input
                className="join-page__input"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                placeholder="5829"
                maxLength={6}
              />
            </label>
            <div className="join-page__seats" role="radiogroup" aria-label="Join role">
              <label className="join-page__seat">
                <input
                  type="radio"
                  name="remote-join-role"
                  checked={!joinAsSpectator}
                  onChange={() => setJoinAsSpectator(false)}
                />
                <span>Watch &amp; play</span>
              </label>
              <label className="join-page__seat">
                <input
                  type="radio"
                  name="remote-join-role"
                  checked={joinAsSpectator}
                  onChange={() => setJoinAsSpectator(true)}
                />
                <span>Watch only (spectator)</span>
              </label>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!roomInput.trim()}
              onClick={() => setJoined(true)}
            >
              Join room
            </button>
            {peer.error && <p className="join-page__error">{peer.error}</p>}
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className="join-page">
      <p>Co-op join opens the full app with dual-emulator sync.</p>
      <a
        className="btn btn--primary"
        href={buildJoinUrl(roomInput || initialRoom, 'coop', {
          spectator: joinAsSpectator,
        })}
      >
        Open co-op session
      </a>
    </div>
  )
}

export function resolveJoinRoute(): {
  room: string
  mode: SessionMode
  role: JoinRole
} | null {
  const params = new URLSearchParams(window.location.search)
  const coopLegacy = params.get('coop')
  if (coopLegacy) {
    return { room: normalizeRoomCode(coopLegacy), mode: 'coop', role: 'player' }
  }

  const { room, mode, role } = parseJoinLocation(window.location.search, window.location.hash)
  if (!room || !mode) return null

  const hasJoinFlag =
    params.get('join') === '1' ||
    window.location.pathname.endsWith('/join') ||
    Boolean(params.get('room') && params.get('mode'))

  if (!hasJoinFlag) return null
  return { room, mode, role }
}
