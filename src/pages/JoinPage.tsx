import { useEffect, useState } from 'react'
import { VirtualController } from '../components/VirtualController'
import { usePeerSession } from '../hooks/usePeerSession'
import { useLocalGuest } from '../hooks/multiplayer/useLocalGuest'
import { useRemoteGuest } from '../hooks/multiplayer/useRemoteGuest'
import { parseJoinLocation, type SessionMode } from '../lib/peer'
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
    if (!joined || !roomInput.trim()) return
    void peer.joinWithRoomCode(roomInput.trim().toUpperCase(), mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join once
  }, [joined])

  if (mode === 'local') {
    return (
      <div className="join-page join-page--controller">
        <header className="join-page__header">
          <h1>Player {localGuest.seat}</h1>
          <p className="join-page__status">
            {peer.connectionState === 'connected' ? 'Connected' : 'Connecting…'}
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
      </div>
    )
  }

  if (mode === 'remote') {
    return (
      <div className="join-page join-page--stream">
        <header className="join-page__header">
          <h1>Remote play</h1>
          <p className="join-page__status">{peer.connectionState}</p>
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
      <a className="btn btn--primary" href={`${import.meta.env.BASE_URL}?coop=${roomInput}`}>
        Open co-op session
      </a>
    </div>
  )
}

export function resolveJoinRoute(): { room: string; mode: SessionMode } | null {
  const params = new URLSearchParams(window.location.search)
  if (params.get('join') !== '1' && !window.location.pathname.endsWith('/join')) {
    const coop = params.get('coop')
    if (coop) return { room: coop, mode: 'coop' }
    return null
  }
  const { room, mode } = parseJoinLocation(window.location.search, window.location.hash)
  if (!room || !mode) return null
  return { room, mode }
}
