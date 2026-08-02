import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { LatencyBadge } from './LatencyBadge'
import { copySignalString, type LatencyProfile } from '../lib/peer'
import type { SessionMode } from '../lib/peer/protocol'
import type { PeerPhase, PeerTransferStatus } from '../hooks/usePeerSession'
import type { PeerConnectionState, PeerRole, PeerSeat } from '../lib/peer'
import type { MaxPlayers, RosterEntry } from '../lib/peer/roster'
import { playerSeats } from '../lib/peer/roster'
import type { SystemId } from '../lib/cores'

interface PeerLobbyProps {
  open: boolean
  onClose: () => void
  phase: PeerPhase
  role: PeerRole | null
  seat: PeerSeat | null
  sessionMode: SessionMode
  onSessionModeChange: (mode: SessionMode) => void
  connectionState: PeerConnectionState
  localSignal: string
  roomCode: string | null
  joinUrl: string | null
  signalingLabel: string
  connectionPathLabel: string
  useManualSignaling: boolean
  transfer: PeerTransferStatus
  error: string | null
  remoteReady: boolean
  canHostShareGame: boolean
  emuReady: boolean
  hostOnScreenP2: boolean
  onHostOnScreenP2Change: (on: boolean) => void
  onCreateHost: () => void | Promise<void>
  onAcceptAnswer: (answer: string) => void | Promise<void>
  onJoinOffer: (offer: string) => void | Promise<void>
  onShareGame: () => void | Promise<void>
  onReady: () => void
  onGo: () => void
  onDisconnect: () => void
  remoteSeat?: PeerSeat | null
  remoteSpectator?: boolean
  onPickRole?: (seat: PeerSeat | null) => void
  onPickSeat?: (seat: PeerSeat) => void
  isSeatAvailable?: (seat: PeerSeat) => boolean
  onJoinRoomCode?: (code: string, opts: { asSpectator: boolean }) => void | Promise<void>
  onReconnect?: () => void | Promise<void>
  connectionLost?: boolean
  onSyncGameState?: () => void | Promise<void>
  stateSyncBusy?: boolean
  latencyProfile?: LatencyProfile
  suggestStateSync?: boolean
  onOpenControllers?: () => void
  gameSystem?: SystemId | null
  multiGuest?: boolean
  maxPlayers?: MaxPlayers
  onMaxPlayersChange?: (n: MaxPlayers) => void
  roster?: RosterEntry[]
  connectedGuestCount?: number
}

export function PeerLobby({
  open,
  onClose,
  phase,
  role,
  seat,
  sessionMode,
  onSessionModeChange,
  connectionState,
  localSignal,
  roomCode,
  joinUrl,
  signalingLabel,
  connectionPathLabel,
  useManualSignaling,
  transfer,
  error,
  remoteReady,
  canHostShareGame,
  emuReady,
  hostOnScreenP2,
  onHostOnScreenP2Change,
  onCreateHost,
  onAcceptAnswer,
  onJoinOffer,
  onShareGame,
  onReady,
  onGo,
  onDisconnect,
  remoteSeat = null,
  remoteSpectator = false,
  onPickRole,
  onPickSeat,
  isSeatAvailable,
  onJoinRoomCode,
  onReconnect,
  connectionLost = false,
  onSyncGameState,
  stateSyncBusy = false,
  latencyProfile,
  suggestStateSync = false,
  onOpenControllers,
  gameSystem = null,
  multiGuest = false,
  maxPlayers = 2,
  onMaxPlayersChange,
  roster = [],
  connectedGuestCount = 0,
}: PeerLobbyProps) {
  const [pasteValue, setPasteValue] = useState('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinRoomInput, setJoinRoomInput] = useState('')
  const [joinAsSpectator, setJoinAsSpectator] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanStreamRef = useRef<MediaStream | null>(null)

  const qrSource = joinUrl || localSignal

  useEffect(() => {
    if (!qrSource) {
      setQrUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(qrSource, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      color: { dark: '#06110c', light: '#e8f7ee' },
    }).then((url) => {
      if (!cancelled) setQrUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [qrSource])

  useEffect(() => {
    if (!open) stopScan()
    return () => stopScan()
  }, [open])

  useEffect(() => {
    if (useManualSignaling) {
      setManualOpen(true)
      setAdvancedOpen(true)
    }
  }, [useManualSignaling])

  if (!open) return null

  const signalKind: 'offer' | 'answer' | null =
    phase === 'host-offer' ? 'offer' : phase === 'guest-answer' ? 'answer' : null

  const transferPct =
    transfer.total > 0 ? Math.min(100, Math.round((transfer.received / transfer.total) * 100)) : 0

  const showCoopFlow = sessionMode === 'coop'
  const pickRoleFn = onPickRole ?? onPickSeat
  const seatPickerSeats = playerSeats(multiGuest ? maxPlayers : 2)
  const showRolePicker =
    Boolean(pickRoleFn && isSeatAvailable) &&
    (connectionState === 'connected' || (multiGuest && role === 'host' && phase !== 'idle'))
  const showManualExchange =
    manualOpen ||
    useManualSignaling ||
    phase === 'host-offer' ||
    phase === 'guest-answer' ||
    (phase === 'error' && role === 'guest')

  async function withBusy(fn: () => void | Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setStatusNote(null)
    try {
      await fn()
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function handleCopyJoinUrl() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setStatusNote('Join link copied')
    } catch {
      setStatusNote('Copy failed')
    }
  }

  async function handleCopySignal() {
    if (!localSignal) return
    const ok = await copySignalString(localSignal)
    setStatusNote(ok ? 'SDP copied' : 'Copy failed')
  }

  function stopScan() {
    setScanning(false)
    scanStreamRef.current?.getTracks().forEach((t) => t.stop())
    scanStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function startScan() {
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
        }
      }
    ).BarcodeDetector

    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setStatusNote('Camera QR scan not supported — paste instead')
      return
    }

    stopScan()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      scanStreamRef.current = stream
      setScanning(true)
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      const detector = new Detector({ formats: ['qr_code'] })
      const tick = async () => {
        if (!scanStreamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          const value = codes[0]?.rawValue?.trim()
          if (value) {
            stopScan()
            setPasteValue(value)
            if (phase === 'host-offer') await onAcceptAnswer(value)
            else if (phase === 'idle') await onJoinOffer(value)
            setStatusNote('QR applied')
            return
          }
        } catch {
          // keep scanning
        }
        if (scanStreamRef.current) requestAnimationFrame(() => void tick())
      }
      requestAnimationFrame(() => void tick())
    } catch {
      stopScan()
      setStatusNote('Camera permission denied')
    }
  }

  return (
    <div className="peer-lobby" role="dialog" aria-modal="true" aria-label="Play with friends">
      <div className="peer-lobby__panel">
        <header className="peer-lobby__header">
          <h2>Play with Friends</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        {(phase === 'connecting' || (phase === 'error' && role === 'guest')) && role === 'guest' && (
          <div className="peer-lobby__status">
            <p>
              {phase === 'connecting'
                ? 'Joining room… (retrying if host is still setting up)'
                : 'Could not join automatically'}
            </p>
            {roomCode && (
              <p>
                Room: <strong>{roomCode}</strong>
              </p>
            )}
            {error && <p className="peer-lobby__hint">{error}</p>}
          </div>
        )}

        {phase === 'idle' && role !== 'guest' && (
          <>
            <div className="peer-lobby__modes" role="radiogroup" aria-label="Session mode">
              <label className="peer-lobby__mode">
                <input
                  type="radio"
                  name="session-mode"
                  checked={sessionMode === 'local'}
                  onChange={() => onSessionModeChange('local')}
                />
                <span>Local co-op (phones as controllers)</span>
              </label>
              <label className="peer-lobby__mode">
                <input
                  type="radio"
                  name="session-mode"
                  checked={sessionMode === 'remote'}
                  onChange={() => onSessionModeChange('remote')}
                />
                <span>Remote stream (share video/audio)</span>
              </label>
            </div>

            {(sessionMode === 'local' || sessionMode === 'remote') && onMaxPlayersChange && (
              <div className="peer-lobby__modes">
                <label className="peer-lobby__mode peer-lobby__mode--row">
                  <span>Max players</span>
                  <select
                    value={maxPlayers}
                    onChange={(e) =>
                      onMaxPlayersChange(Number(e.target.value) as MaxPlayers)
                    }
                  >
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </label>
                {maxPlayers > 2 && (
                  <p className="peer-lobby__hint">
                    {sessionMode === 'remote'
                      ? 'Up to 5 guests can watch the stream and pick a player slot from their phone.'
                      : gameSystem === 'snes'
                        ? 'SNES multitap — each guest joins as P2–P5 from their phone.'
                        : 'Load an SNES ROM for 3–5 player multitap (NES supports 2 players only).'}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              className="btn btn--ghost peer-lobby__advanced"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              Advanced options {advancedOpen ? '▲' : '▼'}
            </button>

            {advancedOpen && (
              <div className="peer-lobby__modes">
                <label className="peer-lobby__mode">
                  <input
                    type="radio"
                    name="session-mode"
                    checked={sessionMode === 'coop'}
                    onChange={() => onSessionModeChange('coop')}
                  />
                  <span>Dual-emulator (ROM setup, then input sync)</span>
                </label>
                <label className="peer-lobby__mode">
                  <input
                    type="checkbox"
                    checked={manualOpen}
                    onChange={(e) => setManualOpen(e.target.checked)}
                  />
                  <span>Manual SDP WebRTC paste</span>
                </label>
                {sessionMode === 'local' && (
                  <label className="peer-lobby__mode">
                    <input
                      type="checkbox"
                      checked={hostOnScreenP2}
                      onChange={(e) => onHostOnScreenP2Change(e.target.checked)}
                    />
                    <span>Host on-screen Player 2 pad (fallback)</span>
                  </label>
                )}
              </div>
            )}

            <div className="peer-lobby__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void withBusy(onCreateHost)}
              >
                Host session
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => {
                  setJoinOpen(true)
                  setManualOpen(false)
                  setStatusNote(null)
                }}
              >
                Join session
              </button>
            </div>

            {joinOpen && onJoinRoomCode && (
              <div className="peer-lobby__signal-in">
                <p className="peer-lobby__label">Join with room code</p>
                <input
                  className="peer-lobby__input"
                  value={joinRoomInput}
                  onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                  placeholder="TPS6"
                  maxLength={6}
                  autoComplete="off"
                />
                <div className="peer-lobby__modes" role="radiogroup" aria-label="Join role">
                  <label className="peer-lobby__mode">
                    <input
                      type="radio"
                      name="join-role"
                      checked={!joinAsSpectator}
                      onChange={() => setJoinAsSpectator(false)}
                    />
                    <span>Play (controller)</span>
                  </label>
                  <label className="peer-lobby__mode">
                    <input
                      type="radio"
                      name="join-role"
                      checked={joinAsSpectator}
                      onChange={() => setJoinAsSpectator(true)}
                    />
                    <span>Watch only (spectator)</span>
                  </label>
                </div>
                <div className="peer-lobby__row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || !joinRoomInput.trim()}
                    onClick={() =>
                      void withBusy(async () => {
                        await onJoinRoomCode(joinRoomInput.trim(), { asSpectator: joinAsSpectator })
                        setJoinOpen(false)
                      })
                    }
                  >
                    Join room
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setManualOpen(true)}
                  >
                    Manual SDP instead
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {(useManualSignaling || signalingLabel) && phase !== 'idle' && (
          <p className="peer-lobby__fallback">
            {useManualSignaling
              ? 'Room code unavailable — using manual SDP paste'
              : `Signaling: ${signalingLabel}`}
          </p>
        )}

        {phase !== 'idle' && connectionPathLabel && connectionPathLabel !== 'Connecting…' && (
          <p className="peer-lobby__fallback">
            Data path: <strong>{connectionPathLabel}</strong>
            {connectionState === 'connected' && latencyProfile && (
              <>
                {' '}
                · <LatencyBadge profile={latencyProfile} connected showAdvice />
              </>
            )}
          </p>
        )}

        {roomCode && joinUrl && phase !== 'idle' && (
          <div className="peer-lobby__signal-out">
            <p className="peer-lobby__label">Room code</p>
            <p className="peer-lobby__room">{roomCode.split('').join(' ')}</p>
            {qrUrl && (
              <img className="peer-lobby__qr" src={qrUrl} alt="Join QR code" />
            )}
            <p className="peer-lobby__hint">{joinUrl}</p>
            <button type="button" className="btn btn--ghost" onClick={() => void handleCopyJoinUrl()}>
              Copy join link
            </button>
            {phase === 'host-offer' && connectionState === 'awaiting-answer' && (
              <p className="peer-lobby__hint">
                Waiting for your friend to join with the room code or link above…
              </p>
            )}
          </div>
        )}

        {showManualExchange && (
          <div className="peer-lobby__exchange">
            {localSignal && signalKind && (
              <div className="peer-lobby__signal-out">
                <p className="peer-lobby__label">Manual SDP ({signalKind})</p>
                <textarea className="peer-lobby__textarea" readOnly value={localSignal} rows={3} />
                <button type="button" className="btn btn--ghost" onClick={() => void handleCopySignal()}>
                  Copy SDP
                </button>
              </div>
            )}

            <div className="peer-lobby__signal-in">
              <p className="peer-lobby__label">
                {phase === 'host-offer' ? 'Paste/scan guest answer' : 'Paste/scan host offer'}
              </p>
              <textarea
                className="peer-lobby__textarea"
                value={pasteValue}
                rows={3}
                placeholder="RG1.…"
                onChange={(e) => setPasteValue(e.target.value)}
                disabled={phase === 'guest-answer'}
              />
              <div className="peer-lobby__row">
                {phase !== 'guest-answer' && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy || scanning}
                      onClick={() => void startScan()}
                    >
                      {scanning ? 'Scanning…' : 'Scan QR'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy || !pasteValue.trim()}
                      onClick={() =>
                        void withBusy(async () => {
                          const value = pasteValue.trim()
                          if (phase === 'host-offer') await onAcceptAnswer(value)
                          else await onJoinOffer(value)
                          setPasteValue('')
                        })
                      }
                    >
                      Apply
                    </button>
                  </>
                )}
              </div>
              {scanning && (
                <video ref={videoRef} className="peer-lobby__video" muted playsInline />
              )}
            </div>
          </div>
        )}

        {(phase === 'connecting' ||
          phase === 'linked' ||
          phase === 'transferring' ||
          phase === 'ready-wait' ||
          phase === 'playing') && (
          <div className="peer-lobby__status">
            <p>
              Mode: <strong>{sessionMode}</strong> · Role: <strong>{role ?? '—'}</strong> ·{' '}
              {seat === null ? (
                <strong>Spectator</strong>
              ) : (
                <>
                  P{seat}
                </>
              )}{' '}
              ·{' '}
              {connectionState === 'awaiting-answer' && role === 'host' ? (
                <strong>waiting for guest</strong>
              ) : connectionState === 'awaiting-answer' && role === 'guest' ? (
                <strong>waiting for host</strong>
              ) : (
                connectionState
              )}
            </p>
            {connectionState === 'awaiting-answer' && role === 'host' && !multiGuest && (
              <p className="peer-lobby__hint">
                Share the room code or join link with your friend. If they already joined, try
                Reconnect or paste their answer below.
              </p>
            )}
            {multiGuest && role === 'host' && phase === 'linked' && (
              <p className="peer-lobby__hint">
                Share the join link — guests can connect from other devices. ({connectedGuestCount}{' '}
                guest{connectedGuestCount === 1 ? '' : 's'} connected)
              </p>
            )}
            {showRolePicker && (
              <div className="peer-lobby__modes" role="radiogroup" aria-label="Your role">
                <p className="peer-lobby__label">Your role</p>
                {seatPickerSeats.map((player) => {
                  const taken = !isSeatAvailable!(player)
                  const checked = seat === player
                  return (
                    <label key={player} className="peer-lobby__mode">
                      <input
                        type="radio"
                        name="player-slot"
                        checked={checked}
                        disabled={taken && !checked}
                        onChange={() => pickRoleFn!(player)}
                      />
                      <span>
                        Player {player}
                        {checked ? ' (you)' : ''}
                        {taken && !checked ? ' (taken)' : ''}
                      </span>
                    </label>
                  )
                })}
                {onPickRole && (
                  <label className="peer-lobby__mode">
                    <input
                      type="radio"
                      name="player-slot"
                      checked={seat === null}
                      onChange={() => onPickRole(null)}
                    />
                    <span>Spectator{seat === null ? ' (you)' : ''}</span>
                  </label>
                )}
                {!multiGuest && remoteSeat && seat && remoteSeat !== seat && (
                  <p className="peer-lobby__hint">Other device is Player {remoteSeat}.</p>
                )}
                {!multiGuest && remoteSpectator && seat !== null && (
                  <p className="peer-lobby__hint">Other device is spectating.</p>
                )}
              </div>
            )}
            {multiGuest && roster.length > 0 && (
              <div className="peer-lobby__modes">
                <p className="peer-lobby__label">
                  Players ({connectedGuestCount + 1}/{maxPlayers} connected)
                </p>
                <ul className="peer-lobby__roster">
                  {roster.map((entry) => (
                    <li
                      key={entry.peerId}
                      className={
                        entry.status === 'disconnected' ? 'peer-lobby__roster-item--away' : undefined
                      }
                    >
                      {entry.role === 'host' ? 'Host' : 'Guest'} ·{' '}
                      {entry.seat === null ? 'Spectator' : `P${entry.seat}`}
                      {entry.status === 'connecting' && ' · joining…'}
                      {entry.status === 'disconnected' && ' · left'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {phase === 'linked' && role === 'host' && showCoopFlow && (
              <>
                {canHostShareGame ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void withBusy(onShareGame)}
                  >
                    Share ROM &amp; load game
                  </button>
                ) : (
                  <p className="peer-lobby__hint">Load a ROM on this device, then share.</p>
                )}
              </>
            )}
            {phase === 'linked' && role === 'host' && !showCoopFlow && (
              <p className="peer-lobby__hint">
                Linked — {sessionMode === 'local' ? 'waiting for controller input' : 'starting stream…'}
              </p>
            )}
            {phase === 'linked' && role === 'guest' && showCoopFlow && (
              <p className="peer-lobby__hint">Waiting for host to share ROM…</p>
            )}
            {phase === 'transferring' && (
              <p>
                Transferring {transfer.kind ?? 'data'}… {transferPct}%
              </p>
            )}
            {phase === 'ready-wait' && showCoopFlow && (
              <div className="peer-lobby__row">
                <button type="button" className="btn btn--ghost" disabled={!emuReady} onClick={onReady}>
                  Ready
                </button>
                {role === 'host' && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!remoteReady || !emuReady}
                    onClick={onGo}
                  >
                    Go
                  </button>
                )}
              </div>
            )}
            {phase === 'playing' && showCoopFlow && (
              <>
                <p className="peer-lobby__hint">
                  Input sync active — P{seat} on this device. Both emulators run locked
                  60&nbsp;Hz NTSC timing with latency-buffered inputs on both sides. State
                  sync runs automatically in the background; use manual sync if you notice drift.
                </p>
                {suggestStateSync && latencyProfile?.advice && (
                  <p className="peer-lobby__hint peer-lobby__hint--warn">
                    {latencyProfile.advice}
                  </p>
                )}
                {onSyncGameState && (
                  <div className="peer-lobby__row">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy || stateSyncBusy || !emuReady}
                      onClick={() =>
                        void withBusy(async () => {
                          await onSyncGameState()
                          setStatusNote(
                            role === 'host'
                              ? 'Save state sent to peer'
                              : 'Requested save state from host',
                          )
                        })
                      }
                    >
                      {stateSyncBusy
                        ? 'Syncing game state…'
                        : role === 'host'
                          ? 'Send game state'
                          : 'Fetch game state'}
                    </button>
                    {transfer.kind === 'state' && transfer.total > 0 && (
                      <p className="peer-lobby__hint">
                        Receiving state… {transferPct}%
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(statusNote || error) && <p className="peer-lobby__note">{error ?? statusNote}</p>}

        {phase !== 'idle' && (
          <div className="peer-lobby__footer">
            {(connectionLost || (error && roomCode)) && onReconnect && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void withBusy(onReconnect)}
              >
                Reconnect
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                stopScan()
                onDisconnect()
                setPasteValue('')
                setStatusNote(null)
              }}
            >
              Disconnect
            </button>
            {onOpenControllers && (
              <button type="button" className="btn btn--ghost" onClick={onOpenControllers}>
                Controllers
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
