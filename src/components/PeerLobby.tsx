import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { copySignalString, shareSignalString } from '../lib/peer'
import type { PeerPhase, PeerTransferStatus } from '../hooks/usePeerSession'
import type { PeerConnectionState, PeerRole, PeerSeat } from '../lib/peer'

interface PeerLobbyProps {
  open: boolean
  onClose: () => void
  phase: PeerPhase
  role: PeerRole | null
  seat: PeerSeat | null
  connectionState: PeerConnectionState
  localSignal: string
  transfer: PeerTransferStatus
  error: string | null
  remoteReady: boolean
  canHostShareGame: boolean
  emuReady: boolean
  onCreateHost: () => void | Promise<void>
  onAcceptAnswer: (answer: string) => void | Promise<void>
  onJoinOffer: (offer: string) => void | Promise<void>
  onShareGame: () => void | Promise<void>
  onReady: () => void
  onGo: () => void
  onResync: () => void | Promise<void>
  onRequestResync: () => void
  onDisconnect: () => void
  onOpenControllers?: () => void
}

type ScanKind = 'offer' | 'answer'

export function PeerLobby({
  open,
  onClose,
  phase,
  role,
  seat,
  connectionState,
  localSignal,
  transfer,
  error,
  remoteReady,
  canHostShareGame,
  emuReady,
  onCreateHost,
  onAcceptAnswer,
  onJoinOffer,
  onShareGame,
  onReady,
  onGo,
  onResync,
  onRequestResync,
  onDisconnect,
  onOpenControllers,
}: PeerLobbyProps) {
  const [pasteValue, setPasteValue] = useState('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanStreamRef = useRef<MediaStream | null>(null)
  const scanKindRef = useRef<ScanKind>('offer')

  useEffect(() => {
    if (!localSignal) {
      setQrUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(localSignal, {
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
  }, [localSignal])

  useEffect(() => {
    if (!open) stopScan()
    return () => stopScan()
  }, [open])

  if (!open) return null

  const signalKind: 'offer' | 'answer' | null =
    phase === 'host-offer' ? 'offer' : phase === 'guest-answer' ? 'answer' : null

  const transferPct =
    transfer.total > 0 ? Math.min(100, Math.round((transfer.received / transfer.total) * 100)) : 0

  async function withBusy(fn: () => void | Promise<void>) {
    setBusy(true)
    setStatusNote(null)
    try {
      await fn()
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!localSignal) return
    const ok = await copySignalString(localSignal)
    setStatusNote(ok ? 'Copied — paste into a messaging app or the other device' : 'Copy failed')
  }

  async function handleShare() {
    if (!localSignal || !signalKind) return
    const result = await shareSignalString(localSignal, signalKind)
    if (result === 'shared') setStatusNote('Opened share sheet — send via any messaging app')
    else if (result === 'copied') setStatusNote('Share unavailable — copied to clipboard instead')
    else setStatusNote('Share unavailable — select and copy the text below')
  }

  function stopScan() {
    setScanning(false)
    scanStreamRef.current?.getTracks().forEach((t) => t.stop())
    scanStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function startScan(kind: ScanKind) {
    scanKindRef.current = kind
    setStatusNote(null)
    // Prefer BarcodeDetector when available.
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
        }
      }
    ).BarcodeDetector

    if (!Detector) {
      setStatusNote('Camera QR scan not supported here — paste the string instead')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusNote('Camera not available — paste the string instead')
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
            setStatusNote('QR captured — tap Apply')
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
      setStatusNote('Camera permission denied — paste the string instead')
    }
  }

  return (
    <div className="peer-lobby" role="dialog" aria-modal="true" aria-label="2 player session">
      <div className="peer-lobby__panel">
        <header className="peer-lobby__header">
          <h2>2 Player</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="peer-lobby__lead">
          Connect over WebRTC. Exchange a compressed offer/answer with a QR code, copy/paste, or any
          messaging app (iMessage, WhatsApp, Slack, etc.). Play stays on the peer DataChannel.
        </p>

        {phase === 'idle' && (
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
              onClick={() => setStatusNote('Paste or scan a host offer below, then Join')}
            >
              Join session
            </button>
          </div>
        )}

        {(phase === 'idle' || phase === 'host-offer' || phase === 'guest-answer') && (
          <div className="peer-lobby__exchange">
            {localSignal && signalKind && (
              <div className="peer-lobby__signal-out">
                <p className="peer-lobby__label">
                  Your compressed {signalKind} — share via QR, copy, or messaging app
                </p>
                {qrUrl && (
                  <img className="peer-lobby__qr" src={qrUrl} alt={`QR code for ${signalKind}`} />
                )}
                <textarea
                  className="peer-lobby__textarea"
                  readOnly
                  value={localSignal}
                  rows={4}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="peer-lobby__row">
                  <button type="button" className="btn btn--ghost" onClick={() => void handleCopy()}>
                    Copy
                  </button>
                  <button type="button" className="btn btn--primary" onClick={() => void handleShare()}>
                    Share via messaging app
                  </button>
                </div>
                <p className="peer-lobby__hint">
                  Send the string through iMessage, WhatsApp, Slack, email, or any chat — then paste on
                  the other device. Take your time pasting; the host waits for the answer. Same Wi‑Fi
                  or hotspot recommended for WebRTC.
                </p>
              </div>
            )}

            <div className="peer-lobby__signal-in">
              <p className="peer-lobby__label">
                {phase === 'host-offer'
                  ? 'Paste or scan guest answer'
                  : phase === 'guest-answer'
                    ? 'Waiting for host to accept your answer…'
                    : 'Paste or scan host offer to join'}
              </p>
              <textarea
                className="peer-lobby__textarea"
                value={pasteValue}
                rows={4}
                placeholder="RG1.… paste offer/answer from messaging app or QR"
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
                      onClick={() =>
                        void startScan(phase === 'host-offer' ? 'answer' : 'offer')
                      }
                    >
                      {scanning ? 'Scanning…' : 'Scan QR'}
                    </button>
                    {scanning && (
                      <button type="button" className="btn btn--ghost" onClick={stopScan}>
                        Stop camera
                      </button>
                    )}
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
                      {phase === 'host-offer' ? 'Accept answer' : 'Join with offer'}
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
              Role: <strong>{role ?? '—'}</strong> · Seat P{seat ?? '—'} · Link:{' '}
              <strong>{connectionState}</strong>
              {phase === 'connecting' && connectionState !== 'connected' ? ' (establishing…)…' : ''}
            </p>
            {phase === 'connecting' && connectionState !== 'connected' && (
              <p className="peer-lobby__hint">
                Establishing WebRTC… keep both devices on the same Wi‑Fi/hotspot. If this hangs,
                disconnect and exchange a fresh offer/answer.
              </p>
            )}
            {phase === 'transferring' && (
              <p>
                Transferring {transfer.kind ?? 'data'}… {transferPct}%
              </p>
            )}
            {phase === 'linked' && role === 'host' && (
              <>
                {canHostShareGame ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void withBusy(onShareGame)}
                  >
                    Share ROM &amp; start sync
                  </button>
                ) : (
                  <p className="peer-lobby__hint">
                    Linked. Load a ROM on this device, then share it with the guest.
                  </p>
                )}
              </>
            )}
            {phase === 'linked' && role === 'guest' && (
              <p className="peer-lobby__hint">Linked — waiting for host to share the ROM…</p>
            )}
            {(phase === 'ready-wait' || phase === 'playing') &&
              role === 'host' &&
              canHostShareGame && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => void withBusy(onShareGame)}
                >
                  Re-share current ROM
                </button>
              )}
            {phase === 'ready-wait' && (
              <div className="peer-lobby__row">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={!emuReady}
                  onClick={onReady}
                >
                  {emuReady ? 'Ready' : 'Waiting for emulator…'}
                </button>
                {role === 'host' && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!remoteReady || !emuReady}
                    onClick={onGo}
                  >
                    {remoteReady ? 'Go — start together' : 'Waiting for guest ready…'}
                  </button>
                )}
              </div>
            )}
            {phase === 'playing' && (
              <div className="peer-lobby__row">
                {role === 'host' ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void withBusy(onResync)}
                  >
                    Push resync
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost" onClick={onRequestResync}>
                    Request resync
                  </button>
                )}
                {onOpenControllers && (
                  <button type="button" className="btn btn--ghost" onClick={onOpenControllers}>
                    Controllers
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="peer-lobby__status">
            <p className="peer-lobby__hint">
              Signaling was interrupted. Disconnect and create a fresh host offer, then paste the
              answer before starting a new exchange on the other device.
            </p>
          </div>
        )}

        {(phase === 'idle' || phase === 'host-offer' || phase === 'guest-answer') &&
          onOpenControllers && (
            <div className="peer-lobby__row">
              <button type="button" className="btn btn--ghost" onClick={onOpenControllers}>
                Choose controllers
              </button>
            </div>
          )}

        {(statusNote || error) && (
          <p className="peer-lobby__note">{error ?? statusNote}</p>
        )}

        {phase !== 'idle' && (
          <div className="peer-lobby__footer">
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
              {phase === 'error' ? 'Start over' : 'Disconnect'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
