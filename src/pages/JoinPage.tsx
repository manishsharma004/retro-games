import { useEffect, useRef, useState } from 'react'
import { LatencyBadge } from '../components/LatencyBadge'
import { GuestRolePicker } from '../components/GuestRolePicker'
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
import type { PeerSeat } from '../lib/peer/protocol'
import { loadSettings } from '../lib/settings'
import '../styles/app.css'

interface JoinPageProps {
  initialRoom: string
  initialMode: SessionMode
  initialRole?: JoinRole
}

function defaultPreferredSeat(
  mode: SessionMode,
  role: JoinRole,
  _multiGuest: boolean,
): PeerSeat | null {
  if (role === 'spectator') return null
  return mode === 'remote' || mode === 'local' ? 2 : null
}

export function JoinPage({ initialRoom, initialMode, initialRole = 'player' }: JoinPageProps) {
  const urlJoin = parseJoinLocation(
    typeof window !== 'undefined' ? window.location.search : '',
    '',
  )
  const lobbyMultiGuest =
    urlJoin.multiGuest && (initialMode === 'local' || initialMode === 'remote')
  const lobbyMaxPlayers = urlJoin.maxPlayers ?? (lobbyMultiGuest ? 5 : 2)

  const [mode] = useState<SessionMode>(initialMode)
  const [roomInput, setRoomInput] = useState(initialRoom)
  const [preferredSeat, setPreferredSeat] = useState<PeerSeat | null>(() =>
    defaultPreferredSeat(initialMode, initialRole, lobbyMultiGuest),
  )
  const [joined, setJoined] = useState(false)
  const joinStartedRef = useRef(false)
  const lastSyncedSeatRef = useRef<PeerSeat | null | undefined>(undefined)

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

  const localSpectator = useRemoteGuest({
    enabled: mode === 'local' && joined && peer.seat === null,
    peer,
  })

  const remoteGuest = useRemoteGuest({
    enabled: mode === 'remote' && joined,
    peer,
  })

  useEffect(() => {
    if (!joined || !roomInput.trim()) return

    if (!joinStartedRef.current) {
      joinStartedRef.current = true
      lastSyncedSeatRef.current = preferredSeat
      void peer.joinWithRoomCode(roomInput.trim(), mode, {
        asSpectator: preferredSeat === null,
        initialSeat: preferredSeat,
      })
      return
    }

    if (lastSyncedSeatRef.current === preferredSeat) return
    lastSyncedSeatRef.current = preferredSeat
    peer.pickRole(preferredSeat)
  }, [joined, roomInput, mode, preferredSeat, peer.joinWithRoomCode, peer.pickRole])

  if (mode === 'local') {
    return (
      <div className="join-page join-page--controller">
        <header className="join-page__header">
          <h1>
            {peer.hostGame
              ? peer.hostGame.name
              : peer.seat === null
                ? 'Spectator'
                : `Player ${localGuest.seat ?? peer.seat ?? '—'}`}
          </h1>
          {peer.hostGame && (
            <p className="join-page__hint">
              Host is playing {peer.hostGame.system.toUpperCase()} · {peer.hostGame.name}
            </p>
          )}
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
            <GuestRolePicker
              peer={{
                multiGuest: lobbyMultiGuest,
                maxPlayers: lobbyMaxPlayers,
                seat: preferredSeat,
                isSeatAvailable: () => true,
                pickRole: () => true,
                remoteSeat: null,
                remoteSpectator: false,
              }}
              name="local-join-role"
              value={preferredSeat}
              onChange={setPreferredSeat}
            />
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
            {(peer.connectionState === 'connected' ||
              peer.phase === 'connecting' ||
              peer.phase === 'guest-answer' ||
              (peer.multiGuest && peer.role === 'guest')) && (
              <GuestRolePicker peer={peer} name="join-local-role" />
            )}
            {peer.seat === null && (
              <div className="join-page__spectator-video">
                <video
                  ref={localSpectator.videoRef}
                  className="remote-guest__video join-page__video"
                  autoPlay
                  playsInline
                  muted
                />
                {!localSpectator.hasVideo && peer.connectionState === 'connected' && (
                  <p className="join-page__hint">Waiting for host video stream…</p>
                )}
                {localSpectator.needsTap && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={localSpectator.unmute}
                  >
                    Tap to start video &amp; audio
                  </button>
                )}
              </div>
            )}
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
            <GuestRolePicker
              peer={{
                multiGuest: lobbyMultiGuest,
                maxPlayers: lobbyMaxPlayers,
                seat: preferredSeat,
                isSeatAvailable: () => true,
                pickRole: () => true,
                remoteSeat: null,
                remoteSpectator: false,
              }}
              name="remote-join-role"
              value={preferredSeat}
              onChange={setPreferredSeat}
            />
            <button
              type="button"
              className="btn btn--primary"
              disabled={!roomInput.trim()}
              onClick={() => setJoined(true)}
            >
              Join room
            </button>
            {initialRoom && (
              <p className="join-page__hint">Pick your role above, then tap Join room.</p>
            )}
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
          spectator: preferredSeat === null,
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
