import type { ReactNode } from 'react'
import type { PeerConnectionState, SessionMode } from '../lib/peer'
import type { PeerPhase } from '../hooks/usePeerSession'

interface PeerConnectionStatusProps {
  roomCode?: string | null
  phase: PeerPhase
  connectionState: PeerConnectionState
  connectionLost?: boolean
  error?: string | null
  hasVideo?: boolean
  hostGameName?: string | null
  sessionMode?: SessionMode
  connectivityHint?: string | null
  /** When false, hide after WebRTC connects (local controller guests). */
  requireVideo?: boolean
  variant?: 'overlay' | 'inline'
  onReconnect?: () => void | Promise<void>
  onLeave?: () => void
  children?: ReactNode
}

export function PeerConnectionStatus({
  roomCode,
  phase,
  connectionState,
  connectionLost = false,
  error = null,
  hasVideo = false,
  hostGameName = null,
  sessionMode,
  connectivityHint = null,
  requireVideo = true,
  variant = 'overlay',
  onReconnect,
  onLeave,
  children,
}: PeerConnectionStatusProps) {
  const connecting =
    phase === 'connecting' || phase === 'guest-answer' || connectionState === 'connecting'
  const waitingForStream =
    requireVideo &&
    connectionState === 'connected' &&
    !hasVideo &&
    phase !== 'error' &&
    !connectionLost

  if (connectionState === 'connected' && !connectionLost && !error && phase !== 'error') {
    if (!requireVideo || hasVideo) return null
  }

  const show =
    connecting ||
    waitingForStream ||
    connectionLost ||
    Boolean(error) ||
    phase === 'error'

  if (!show) return null

  let title = 'Connecting…'
  let detail = roomCode ? `Room ${roomCode}` : undefined

  if (connectionLost) {
    title = 'Connection lost'
    detail = error ?? 'Tap Reconnect to try again.'
  } else if (error && phase === 'error') {
    title = 'Could not join'
    detail = error
  } else if (phase === 'guest-answer') {
    title = 'Waiting for host'
    detail = 'Finishing handshake with the host…'
  } else if (connecting) {
    title = 'Joining room…'
    if (error && phase === 'connecting') {
      detail = error
    } else if (sessionMode === 'remote') {
      detail = roomCode
        ? `Connecting to ${roomCode}. The host must open Remote play and create this room first.`
        : 'Connecting to the host…'
    } else {
      detail = roomCode
        ? `Connecting to ${roomCode}. Make sure the host has started the session.`
        : 'Connecting to the host…'
    }
  } else if (waitingForStream) {
    title = 'Connected'
    detail = hostGameName
      ? `Loading ${hostGameName} from host…`
      : 'Waiting for the host video stream. Ask the host to start remote play and load a game.'
  }

  return (
    <div
      className={
        variant === 'inline' ? 'peer-connection-status peer-connection-status--inline' : 'peer-connection-status'
      }
      role="status"
      aria-live="polite"
    >
      <p className="peer-connection-status__title">{title}</p>
      {detail && <p className="peer-connection-status__detail">{detail}</p>}
      {connectivityHint && !detail?.includes(connectivityHint) && (
        <p className="peer-connection-status__hint">{connectivityHint}</p>
      )}
      {children}
      <div className="peer-connection-status__actions">
        {(connectionLost || phase === 'error' || (error && onReconnect)) && onReconnect && (
          <button type="button" className="btn btn--primary" onClick={() => void onReconnect()}>
            Reconnect
          </button>
        )}
        {onLeave && (
          <button type="button" className="btn btn--ghost" onClick={onLeave}>
            Leave
          </button>
        )}
      </div>
    </div>
  )
}
