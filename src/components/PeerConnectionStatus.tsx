import type { PeerConnectionState } from '../lib/peer'
import type { PeerPhase } from '../hooks/usePeerSession'

interface PeerConnectionStatusProps {
  roomCode?: string | null
  phase: PeerPhase
  connectionState: PeerConnectionState
  connectionLost?: boolean
  error?: string | null
  hasVideo?: boolean
  /** When false, hide after WebRTC connects (local controller guests). */
  requireVideo?: boolean
  variant?: 'overlay' | 'inline'
  onReconnect?: () => void | Promise<void>
  onLeave?: () => void
}

export function PeerConnectionStatus({
  roomCode,
  phase,
  connectionState,
  connectionLost = false,
  error = null,
  hasVideo = false,
  requireVideo = true,
  variant = 'overlay',
  onReconnect,
  onLeave,
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
    detail = roomCode
      ? `Connecting to ${roomCode}. Make sure the host has started the session.`
      : 'Connecting to the host…'
  } else if (waitingForStream) {
    title = 'Connected'
    detail = 'Waiting for the host video stream. Ask the host to start remote play and load a game.'
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
      <div className="peer-connection-status__actions">
        {(connectionLost || phase === 'error' || error) && onReconnect && (
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
