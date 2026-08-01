import { useEffect, useRef, useState } from 'react'
import { VirtualController } from '../components/VirtualController'
import { usePeerSession } from '../hooks/usePeerSession'
import { useLocalGuest } from '../hooks/multiplayer/useLocalGuest'
import { useRemoteGuest } from '../hooks/multiplayer/useRemoteGuest'
import { buildJoinUrl, normalizeRoomCode, parseJoinLocation, type SessionMode } from '../lib/peer'
import { DEFAULT_LAYOUT } from '../lib/virtualLayout'
import { loadSettings } from '../lib/settings'
import '../styles/app.css'

interface JoinPageProps {
  initialRoom: string
  initialMode: SessionMode
}

export function JoinPage({ initialRoom, initialMode }: JoinPageProps) {
  const [mode] = useState<SessionMode>(initialMode)
  const [roomInput, setRoomInput] = useState(initialRoom)
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

  const showSeatPicker =
    mode === 'local' && peer.connectionState === 'connected'

  const remoteGuest = useRemoteGuest({
    enabled: mode === 'remote' && joined,
    peer,
  })

  useEffect(() => {
    if (!joined || !roomInput.trim() || joinStartedRef.current) return
    joinStartedRef.current = true
    void peer.joinWithRoomCode(roomInput.trim(), mode)
  }, [joined, roomInput, mode, peer.joinWithRoomCode])

  if (mode === 'local') {
    return (
      <div className="join-page join-page--controller">
        <header className="join-page__header">
          <h1>Player {localGuest.seat ?? peer.seat ?? '—'}</h1>
          <p className="join-page__status">
            {peer.phase === 'connecting' && 'Connecting to room…'}
            {peer.phase === 'guest-answer' && 'Waiting for host to accept…'}
            {peer.connectionState === 'connected' && 'Connected'}
            {peer.connectionState !== 'connected' &&
              peer.phase !== 'connecting' &&
              peer.phase !== 'guest-answer' &&
              'Not connected'}
            {peer.signalingLabel ? ` · ${peer.signalingLabel}` : ''}
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
            <button
              type="button"
              className="btn btn--primary"
              disabled={!roomInput.trim()}
              onClick={() => setJoined(true)}
            >
              Join as controller
            </button>
            {peer.error && <p className="join-page__error">{peer.error}</p>}
          </div>
        ) : (
          <>
            {showSeatPicker && (
              <div className="join-page__seats" role="radiogroup" aria-label="Player slot">
                <p className="join-page__label">Your controller</p>
                {([1, 2] as const).map((player) => {
                  const taken = !peer.isSeatAvailable(player)
                  const checked = peer.seat === player
                  return (
                    <label key={player} className="join-page__seat">
                      <input
                        type="radio"
                        name="join-player-slot"
                        checked={checked}
                        disabled={taken && !checked}
                        onChange={() => peer.pickSeat(player)}
                      />
                      <span>
                        Player {player}
                        {checked ? ' (you)' : ''}
                        {taken && !checked ? ' (taken)' : ''}
                      </span>
                    </label>
                  )
                })}
                {peer.remoteSeat && peer.seat && peer.remoteSeat !== peer.seat && (
                  <p className="join-page__hint">Other device is Player {peer.remoteSeat}.</p>
                )}
              </div>
            )}
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
          </>
        )}
        {joined && peer.error && <p className="join-page__error">{peer.error}</p>}
      </div>
    )
  }

  if (mode === 'remote') {
    return (
      <div className="join-page join-page--stream">
        <header className="join-page__header">
          <h1>Remote play</h1>
          <p className="join-page__status">
            {peer.phase} · {peer.connectionState}
            {peer.error ? ` · ${peer.error}` : ''}
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
              />
            </label>
            <button type="button" className="btn btn--primary" onClick={() => setJoined(true)}>
              Watch &amp; play
            </button>
          </div>
        ) : (
          <>
            <video
              ref={remoteGuest.videoRef}
              className="join-page__video"
              autoPlay
              playsInline
              muted
            />
            {remoteGuest.needsTap && (
              <button type="button" className="btn btn--primary join-page__unmute" onClick={remoteGuest.unmute}>
                Tap to start video
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="join-page">
      <p>Co-op join opens the full app with dual-emulator sync.</p>
      <a
        className="btn btn--primary"
        href={buildJoinUrl(roomInput || initialRoom, 'coop')}
      >
        Open co-op session
      </a>
    </div>
  )
}

export function resolveJoinRoute(): { room: string; mode: SessionMode } | null {
  const params = new URLSearchParams(window.location.search)
  const coopLegacy = params.get('coop')
  if (coopLegacy) {
    return { room: normalizeRoomCode(coopLegacy), mode: 'coop' }
  }

  const { room, mode } = parseJoinLocation(window.location.search, window.location.hash)
  if (!room || !mode) return null

  const hasJoinFlag =
    params.get('join') === '1' ||
    window.location.pathname.endsWith('/join') ||
    Boolean(params.get('room') && params.get('mode'))

  if (!hasJoinFlag) return null
  return { room, mode }
}
