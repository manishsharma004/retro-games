import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PeerConnection,
  formatConnectionPath,
  getLatencyProfile,
  LATENCY_PING_INTERVAL_MS,
  LATENCY_STALE_MS,
  pickSyncSettings,
  smoothLatency,
  COOP_GO_DELAY_MS,
  COOP_RESYNC_RESUME_DELAY_MS,
  type ConnectionPath,
  type IceTier,
  type LatencyProfile,
  type PeerConnectionState,
  type PeerRole,
  type PeerSeat,
  type PeerSyncSettings,
  type SessionMode,
} from '../lib/peer'
import {
  SignalingAdapterChain,
  formatSignalingPath,
  type SignalingAdapterName,
} from '../lib/peer/signaling'
import { normalizeRoomCode } from '../lib/peer/joinUrl'
import type { SystemId } from '../lib/cores'
import type { EmulatorSettings } from '../lib/settings'

export type PeerPhase =
  | 'idle'
  | 'host-offer'
  | 'guest-answer'
  | 'connecting'
  | 'linked'
  | 'transferring'
  | 'ready-wait'
  | 'playing'
  | 'error'

export interface PeerTransferStatus {
  kind: 'rom' | 'state' | null
  received: number
  total: number
}

export interface PeerBootstrapPayload {
  name: string
  system: SystemId
  core: string
  rom: Uint8Array
  state: Uint8Array
  libraryFile?: string
  settings: PeerSyncSettings
}

interface UsePeerSessionOptions {
  settings: EmulatorSettings
  sessionMode?: SessionMode
  onRemoteInput?: (seat: PeerSeat, button: string, down: boolean, executeAt?: number) => void
  onBootstrap?: (payload: PeerBootstrapPayload) => void | Promise<void>
  onGo?: (resumeAt?: number) => void
  onResyncState?: (state: Uint8Array, compressed?: boolean) => void | Promise<void>
  onResyncRequest?: () => void
  onResyncStart?: () => void
  onResyncDone?: (resumeAt?: number) => void
  onPeerError?: (message: string) => void
  onLinked?: () => void
  onRemoteStream?: (stream: MediaStream) => void
  onHello?: (mode: SessionMode, seat: PeerSeat) => void
  onRumble?: (seat: PeerSeat, pattern: number[]) => void
  onLatency?: (ms: number) => void
}

export interface UsePeerSessionResult {
  phase: PeerPhase
  role: PeerRole | null
  seat: PeerSeat | null
  sessionMode: SessionMode
  connectionState: PeerConnectionState
  localSignal: string
  roomCode: string | null
  joinUrl: string | null
  signalingPath: SignalingAdapterName
  signalingLabel: string
  useManualSignaling: boolean
  connectionPath: ConnectionPath
  connectionPathLabel: string
  iceTier: IceTier
  remoteStream: MediaStream | null
  transfer: PeerTransferStatus
  error: string | null
  remoteReady: boolean
  /** Round-trip latency (EMA-smoothed); null until first pong. */
  latencyMs: number | null
  /** Tier, advice, and mode-specific thresholds derived from latency. */
  latencyProfile: LatencyProfile
  /** Seat claimed by the remote peer (for mutual exclusion). */
  remoteSeat: PeerSeat | null
  pickSeat: (seat: 1 | 2) => boolean
  isSeatAvailable: (seat: 1 | 2) => boolean
  createHostOffer: (mode?: SessionMode) => Promise<void>
  acceptGuestAnswer: (answer: string) => Promise<void>
  joinWithOffer: (offer: string, mode?: SessionMode) => Promise<void>
  joinWithRoomCode: (code: string, mode: SessionMode) => Promise<void>
  sendBootstrap: (payload: {
    name: string
    system: SystemId
    core: string
    rom: Uint8Array
    state: Uint8Array
    libraryFile?: string
  }) => Promise<void>
  sendReady: () => void
  sendGo: () => void
  sendInput: (button: string, down: boolean, executeAt?: number) => void
  sendPing: (t: number) => void
  sendResyncState: (state: Uint8Array, compressed?: boolean) => Promise<void>
  sendResyncDone: (resumeAt?: number) => void
  requestResync: () => void
  attachMediaStream: (stream: MediaStream) => Promise<void>
  getConnection: () => PeerConnection | null
  disconnect: () => void
  /** Current seat from ref (always in sync with sendInput). */
  getSeat: () => PeerSeat | null
}

export function usePeerSession(options: UsePeerSessionOptions): UsePeerSessionResult {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const connRef = useRef<PeerConnection | null>(null)
  const signalingRef = useRef<SignalingAdapterChain | null>(null)
  const roleRef = useRef<PeerRole | null>(null)
  const seatRef = useRef<PeerSeat | null>(null)
  const remoteSeatRef = useRef<PeerSeat | null>(null)
  const modeRef = useRef<SessionMode>(options.sessionMode ?? 'local')
  const bootstrapDoneRef = useRef(false)
  const bootstrapMetaRef = useRef<{
    name: string
    system: SystemId
    core: string
    libraryFile?: string
    settings: PeerSyncSettings
    romSize: number
    stateSize: number
  } | null>(null)
  const romBufRef = useRef<Uint8Array | null>(null)
  const stateBufRef = useRef<Uint8Array | null>(null)
  const remoteReadyRef = useRef(false)
  const phaseRef = useRef<PeerPhase>('idle')
  const resyncCompressedRef = useRef(false)
  const hostGenerationRef = useRef(0)
  const hostOfferInFlightRef = useRef(false)
  const signalingSessionUnsubRef = useRef<(() => void) | null>(null)

  const [phase, setPhase] = useState<PeerPhase>('idle')
  const [role, setRole] = useState<PeerRole | null>(null)
  const [seat, setSeat] = useState<PeerSeat | null>(null)
  const [sessionMode, setSessionMode] = useState<SessionMode>(options.sessionMode ?? 'local')
  const [connectionState, setConnectionState] = useState<PeerConnectionState>('idle')
  const [localSignal, setLocalSignal] = useState('')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinUrl, setJoinUrl] = useState<string | null>(null)
  const [signalingPath, setSignalingPath] = useState<SignalingAdapterName>('peerjs')
  const [useManualSignaling, setUseManualSignaling] = useState(false)
  const [connectionPath, setConnectionPath] = useState<ConnectionPath>('unknown')
  const [iceTier, setIceTier] = useState<IceTier>('local')
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [transfer, setTransfer] = useState<PeerTransferStatus>({
    kind: null,
    received: 0,
    total: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [remoteReady, setRemoteReady] = useState(false)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const lastPongAtRef = useRef<number | null>(null)
  const [remoteSeat, setRemoteSeat] = useState<PeerSeat | null>(null)

  const latencyProfile = useMemo(
    () => getLatencyProfile(latencyMs, sessionMode, connectionPath),
    [latencyMs, sessionMode, connectionPath],
  )

  const updatePhase = useCallback((next: PeerPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const sendHello = useCallback((conn: PeerConnection) => {
    const r = roleRef.current
    const s = seatRef.current
    const m = modeRef.current
    if (!r || !s) return
    try {
      conn.sendControl({ type: 'hello', role: r, seat: s, mode: m })
    } catch {
      // ignore
    }
  }, [])

  const applyRemoteSeat = useCallback((seat: PeerSeat, conn: PeerConnection) => {
    if (seat === seatRef.current) {
      const other = (seat === 1 ? 2 : 1) as PeerSeat
      seatRef.current = other
      setSeat(other)
      try {
        conn.sendControl({ type: 'seat-pick', seat: other })
        sendHello(conn)
      } catch {
        // ignore
      }
    }
    remoteSeatRef.current = seat
    setRemoteSeat(seat)
  }, [sendHello])

  const isSeatAvailable = useCallback((seat: 1 | 2) => {
    return remoteSeatRef.current !== seat
  }, [])

  const pickSeat = useCallback(
    (seat: 1 | 2) => {
      if (remoteSeatRef.current === seat) {
        setError(`Player ${seat} is taken by the other device`)
        return false
      }
      setError(null)
      seatRef.current = seat
      setSeat(seat)
      const conn = connRef.current
      if (conn?.connected) {
        try {
          conn.sendControl({ type: 'seat-pick', seat })
          sendHello(conn)
        } catch {
          // ignore
        }
      }
      return true
    },
    [sendHello],
  )

  const publishRenegotiation = useCallback(
    (
      type: 'ice-reoffer' | 'ice-reanswer' | 'media-reoffer' | 'media-reanswer',
      sdp: string,
      tier?: IceTier,
    ) => {
      const conn = connRef.current
      const chain = signalingRef.current
      const payload =
        type === 'ice-reoffer'
          ? { type, sdp, tier: tier ?? 'relay' }
          : { type, sdp }
      if (conn?.connected) {
        try {
          conn.sendControl(payload)
          return
        } catch {
          // fall through to signaling channel
        }
      }
      chain?.sendSessionMessage(payload)
    },
    [],
  )

  const handleRenegotiationOffer = useCallback(
    async (sdp: string, tier: IceTier = 'relay') => {
      const conn = connRef.current
      if (!conn) return
      try {
        const answer = await conn.acceptRenegotiationOffer(sdp, tier)
        publishRenegotiation('ice-reanswer', answer)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ICE renegotiation failed')
      }
    },
    [publishRenegotiation],
  )

  const handleRenegotiationAnswer = useCallback(async (sdp: string) => {
    try {
      await connRef.current?.acceptRenegotiationAnswer(sdp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ICE renegotiation failed')
    }
  }, [])

  const handleMediaRenegotiationOffer = useCallback(
    async (sdp: string) => {
      const conn = connRef.current
      if (!conn) return
      try {
        const answer = await conn.acceptMediaRenegotiationOffer(sdp)
        publishRenegotiation('media-reanswer', answer)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video stream negotiation failed')
      }
    },
    [publishRenegotiation],
  )

  const handleMediaRenegotiationAnswer = useCallback(async (sdp: string) => {
    try {
      await connRef.current?.acceptMediaRenegotiationAnswer(sdp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video stream negotiation failed')
    }
  }, [])

  const wireSignalingSession = useCallback(
    (chain: SignalingAdapterChain) => {
      signalingSessionUnsubRef.current?.()
      signalingSessionUnsubRef.current = chain.onSessionMessage((data) => {
        const msg = data as { type?: string; sdp?: string; tier?: IceTier }
        if (msg.type === 'ice-reoffer' && msg.sdp) void handleRenegotiationOffer(msg.sdp, msg.tier)
        if (msg.type === 'ice-reanswer' && msg.sdp) void handleRenegotiationAnswer(msg.sdp)
        if (msg.type === 'media-reoffer' && msg.sdp) void handleMediaRenegotiationOffer(msg.sdp)
        if (msg.type === 'media-reanswer' && msg.sdp) void handleMediaRenegotiationAnswer(msg.sdp)
      })
    },
    [
      handleRenegotiationAnswer,
      handleRenegotiationOffer,
      handleMediaRenegotiationAnswer,
      handleMediaRenegotiationOffer,
    ],
  )

  const createConnection = useCallback(() => {
    connRef.current?.close()
    bootstrapDoneRef.current = false
    romBufRef.current = null
    stateBufRef.current = null
    bootstrapMetaRef.current = null
    remoteReadyRef.current = false
    setRemoteReady(false)
    setRemoteStream(null)
    setConnectionPath('unknown')
    setIceTier('local')

    const conn = new PeerConnection({
      onState: (state) => {
        setConnectionState(state)
        if (state === 'connected') {
          setError(null)
          if (
            phaseRef.current !== 'playing' &&
            phaseRef.current !== 'ready-wait' &&
            phaseRef.current !== 'transferring'
          ) {
            updatePhase('linked')
          }
          window.setTimeout(() => {
            if (conn.connected) {
              sendHello(conn)
              if (modeRef.current === 'local' || modeRef.current === 'remote') {
                updatePhase('playing')
                optionsRef.current.onGo?.()
              }
            }
            optionsRef.current.onLinked?.()
          }, 0)
        } else if (state === 'failed') {
          updatePhase('error')
          setError((prev) => prev ?? 'Peer connection failed')
        } else if (state === 'awaiting-answer') {
          if (roleRef.current === 'host' && phaseRef.current === 'connecting') {
            updatePhase('host-offer')
          }
        } else if (state === 'connecting') {
          if (
            phaseRef.current === 'host-offer' ||
            phaseRef.current === 'guest-answer' ||
            phaseRef.current === 'idle'
          ) {
            updatePhase('connecting')
          }
        }
      },
      onSignalRefresh: (signal) => {
        setLocalSignal(signal)
        if (roleRef.current === 'guest') updatePhase('guest-answer')
      },
      onRenegotiationOffer: (signal, tier) => {
        publishRenegotiation('ice-reoffer', signal, tier)
      },
      onIceTierChange: (tier) => {
        setIceTier(tier)
      },
      onConnectionPath: (path) => {
        setConnectionPath(path)
      },
      onError: (err) => {
        setError(err.message)
        optionsRef.current.onPeerError?.(err.message)
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream)
        optionsRef.current.onRemoteStream?.(stream)
      },
      onControl: (msg) => {
        if (msg.type === 'hello') {
          modeRef.current = msg.mode
          setSessionMode(msg.mode)
          applyRemoteSeat(msg.seat, conn)
          optionsRef.current.onHello?.(msg.mode, msg.seat)
        } else if (msg.type === 'seat-pick') {
          applyRemoteSeat(msg.seat, conn)
        } else if (msg.type === 'bootstrap') {
          bootstrapDoneRef.current = false
          romBufRef.current = null
          stateBufRef.current = null
          bootstrapMetaRef.current = {
            name: msg.name,
            system: msg.system,
            core: msg.core,
            libraryFile: msg.libraryFile,
            settings: msg.settings,
            romSize: msg.romSize,
            stateSize: msg.stateSize,
          }
          updatePhase('transferring')
        } else if (msg.type === 'input') {
          optionsRef.current.onRemoteInput?.(msg.seat, msg.button, msg.down, msg.t)
        } else if (msg.type === 'rumble') {
          optionsRef.current.onRumble?.(msg.seat, msg.pattern)
        } else if (msg.type === 'ready') {
          remoteReadyRef.current = true
          setRemoteReady(true)
        } else if (msg.type === 'go') {
          updatePhase('playing')
          optionsRef.current.onGo?.(msg.at)
        } else if (msg.type === 'resync-request') {
          optionsRef.current.onResyncRequest?.()
        } else if (msg.type === 'resync-start') {
          optionsRef.current.onResyncStart?.()
        } else if (msg.type === 'resync-done') {
          optionsRef.current.onResyncDone?.('at' in msg ? msg.at : undefined)
        } else if (msg.type === 'ping') {
          try {
            conn.sendControl({ type: 'pong', t: msg.t })
          } catch {
            // ignore
          }
        } else if (msg.type === 'pong') {
          const sample = Date.now() - msg.t
          lastPongAtRef.current = Date.now()
          setLatencyMs((prev) => smoothLatency(prev, sample))
          optionsRef.current.onLatency?.(sample)
        } else if (msg.type === 'ice-reoffer') {
          void handleRenegotiationOffer(msg.sdp, msg.tier)
        } else if (msg.type === 'ice-reanswer') {
          void handleRenegotiationAnswer(msg.sdp)
        } else if (msg.type === 'media-reoffer') {
          void handleMediaRenegotiationOffer(msg.sdp)
        } else if (msg.type === 'media-reanswer') {
          void handleMediaRenegotiationAnswer(msg.sdp)
        }
      },
      onTransferProgress: ({ kind, received, total }) => {
        setTransfer({ kind, received, total })
        if (!bootstrapDoneRef.current) updatePhase('transferring')
      },
      onTransferComplete: ({ kind, data }) => {
        if (bootstrapDoneRef.current && kind === 'state') {
          const compressed = resyncCompressedRef.current
          resyncCompressedRef.current = false
          setTransfer({ kind: null, received: 0, total: 0 })
          void Promise.resolve(optionsRef.current.onResyncState?.(data, compressed)).catch(
            (err) => {
              setError(err instanceof Error ? err.message : 'Failed to import game state')
            },
          )
          return
        }
        if (kind === 'rom') romBufRef.current = data
        if (kind === 'state') stateBufRef.current = data
        const meta = bootstrapMetaRef.current
        const rom = romBufRef.current
        const state = stateBufRef.current
        if (
          meta &&
          rom &&
          state &&
          rom.byteLength === meta.romSize &&
          state.byteLength === meta.stateSize
        ) {
          bootstrapDoneRef.current = true
          updatePhase('ready-wait')
          setTransfer({ kind: null, received: 0, total: 0 })
          void optionsRef.current.onBootstrap?.({
            name: meta.name,
            system: meta.system,
            core: meta.core,
            rom,
            state,
            libraryFile: meta.libraryFile,
            settings: meta.settings,
          })
        }
      },
    })
    connRef.current = conn
    return conn
  }, [
    applyRemoteSeat,
    handleRenegotiationAnswer,
    handleRenegotiationOffer,
    handleMediaRenegotiationAnswer,
    handleMediaRenegotiationOffer,
    publishRenegotiation,
    sendHello,
    updatePhase,
  ])

  useEffect(() => {
    return () => {
      connRef.current?.close()
      signalingRef.current?.close({ rejectPending: true })
      connRef.current = null
      signalingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (options.sessionMode) {
      modeRef.current = options.sessionMode
      setSessionMode(options.sessionMode)
    }
  }, [options.sessionMode])

  const createHostOffer = useCallback(
    async (mode: SessionMode = modeRef.current) => {
      if (hostOfferInFlightRef.current) return
      hostOfferInFlightRef.current = true
      const generation = ++hostGenerationRef.current

      setError(null)
      setLocalSignal('')
      setUseManualSignaling(false)
      modeRef.current = mode
      setSessionMode(mode)
      roleRef.current = 'host'
      seatRef.current = 1
      setRole('host')
      setSeat(1)

      try {
        const conn = createConnection()
        const offer = await conn.createOffer()
        setLocalSignal(offer)

        signalingRef.current?.close()
        const chain = new SignalingAdapterChain()
        signalingRef.current = chain
        wireSignalingSession(chain)

        const room = await chain.hostRoom(offer, { mode })
        if (generation !== hostGenerationRef.current) return

        setRoomCode(room.code)
        setJoinUrl(room.joinUrl)
        setSignalingPath(chain.lastAdapter)
        updatePhase('host-offer')

        const answerPromise = chain.waitForAnswer(room.code)
        void answerPromise
          .then(async (answer) => {
            if (generation !== hostGenerationRef.current) return
            updatePhase('connecting')
            await conn.acceptAnswer(answer)
          })
          .catch((err) => {
            if (generation !== hostGenerationRef.current) return
            setError(err instanceof Error ? err.message : 'Waiting for guest answer failed')
            updatePhase('error')
          })
      } catch {
        if (generation !== hostGenerationRef.current) return
        setUseManualSignaling(true)
        setSignalingPath('manual')
        setRoomCode(null)
        setJoinUrl(null)
        updatePhase('host-offer')
      } finally {
        hostOfferInFlightRef.current = false
      }
    },
    [createConnection, updatePhase, wireSignalingSession],
  )

  const acceptGuestAnswer = useCallback(
    async (answer: string) => {
      const conn = connRef.current
      if (!conn) throw new Error('Create a host offer first')
      setError(null)
      updatePhase('connecting')
      await conn.acceptAnswer(answer)
    },
    [updatePhase],
  )

  const joinWithOffer = useCallback(
    async (offer: string, mode: SessionMode = modeRef.current) => {
      setError(null)
      setLocalSignal('')
      modeRef.current = mode
      setSessionMode(mode)
      roleRef.current = 'guest'
      seatRef.current = 2
      setRole('guest')
      setSeat(2)
      const conn = createConnection()
      const answer = await conn.createAnswerFromOffer(offer)
      setLocalSignal(answer)
      updatePhase('guest-answer')
    },
    [createConnection, updatePhase],
  )

  const joinWithRoomCode = useCallback(
    async (code: string, mode: SessionMode) => {
      const normalized = normalizeRoomCode(code)
      if (!normalized) {
        setError('Enter a valid room code')
        return
      }

      setError(null)
      setRoomCode(normalized)
      modeRef.current = mode
      setSessionMode(mode)
      roleRef.current = 'guest'
      seatRef.current = 2
      setRole('guest')
      setSeat(2)
      updatePhase('connecting')

      const maxAttempts = 6
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        signalingRef.current?.close()
        const chain = new SignalingAdapterChain()
        signalingRef.current = chain
        wireSignalingSession(chain)

        try {
          const offer = await chain.guestFetchOffer(normalized)
          setSignalingPath(chain.lastAdapter)
          const conn = createConnection()
          const answer = await conn.createAnswerFromOffer(offer)
          setLocalSignal(answer)
          await chain.guestPublishAnswer(normalized, answer)
          updatePhase('guest-answer')
          return
        } catch (err) {
          if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
            continue
          }
          setUseManualSignaling(true)
          setSignalingPath('manual')
          setError(
            err instanceof Error
              ? `${err.message} — paste the host offer below`
              : 'Could not join room — paste host offer manually',
          )
          updatePhase('error')
        }
      }
    },
    [createConnection, updatePhase, wireSignalingSession],
  )

  const sendBootstrap = useCallback(
    async (payload: {
      name: string
      system: SystemId
      core: string
      rom: Uint8Array
      state: Uint8Array
      libraryFile?: string
    }) => {
      const conn = connRef.current
      if (!conn?.connected) throw new Error('Not connected')
      updatePhase('transferring')
      const settings = pickSyncSettings(optionsRef.current.settings)
      conn.sendControl({
        type: 'bootstrap',
        name: payload.name,
        system: payload.system,
        core: payload.core,
        romSize: payload.rom.byteLength,
        libraryFile: payload.libraryFile,
        settings,
        stateSize: payload.state.byteLength,
      })
      await conn.sendBlob('rom', payload.rom)
      await conn.sendBlob('state', payload.state)
      bootstrapDoneRef.current = true
      updatePhase('ready-wait')
    },
    [updatePhase],
  )

  const sendReady = useCallback(() => {
    connRef.current?.sendControl({ type: 'ready' })
  }, [])

  const sendGo = useCallback(() => {
    const conn = connRef.current
    if (!conn?.connected) return
    const at = Date.now() + COOP_GO_DELAY_MS
    conn.sendControl({ type: 'go', at })
    updatePhase('playing')
    optionsRef.current.onGo?.(at)
  }, [updatePhase])

  const sendInput = useCallback((button: string, down: boolean, executeAt?: number) => {
    const conn = connRef.current
    const s = seatRef.current
    if (!conn?.connected || !s) return
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'linked') return
    try {
      conn.sendControl({ type: 'input', seat: s, button, down, t: executeAt ?? Date.now() })
    } catch {
      // ignore
    }
  }, [])

  const sendPing = useCallback((t: number) => {
    try {
      connRef.current?.sendControl({ type: 'ping', t })
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (connectionState !== 'connected') return
    const ping = () => {
      const now = Date.now()
      if (
        lastPongAtRef.current !== null &&
        now - lastPongAtRef.current > LATENCY_STALE_MS
      ) {
        lastPongAtRef.current = null
        setLatencyMs(null)
      }
      sendPing(now)
    }
    ping()
    const id = window.setInterval(ping, LATENCY_PING_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [connectionState, sendPing])

  const sendResyncState = useCallback(async (state: Uint8Array, compressed = false) => {
    const conn = connRef.current
    if (!conn?.connected) return
    resyncCompressedRef.current = compressed
    await conn.sendBlob('state', state)
  }, [])

  const requestResync = useCallback(() => {
    connRef.current?.sendControl({ type: 'resync-request' })
  }, [])

  const sendResyncDone = useCallback((resumeAt?: number) => {
    try {
      const at = resumeAt ?? Date.now() + COOP_RESYNC_RESUME_DELAY_MS
      connRef.current?.sendControl({ type: 'resync-done', at })
    } catch {
      // ignore
    }
  }, [])

  const attachMediaStream = useCallback(
    async (stream: MediaStream) => {
      const conn = connRef.current
      if (!conn) throw new Error('No connection')
      const needsRenegotiation = conn.addMediaStream(stream)
      if (needsRenegotiation && roleRef.current === 'host') {
        const sdp = await conn.createMediaRenegotiationOffer()
        publishRenegotiation('media-reoffer', sdp)
      }
    },
    [publishRenegotiation],
  )

  const getConnection = useCallback(() => connRef.current, [])

  const getSeat = useCallback(() => seatRef.current, [])

  const disconnect = useCallback(() => {
    hostGenerationRef.current += 1
    hostOfferInFlightRef.current = false
    signalingSessionUnsubRef.current?.()
    signalingSessionUnsubRef.current = null
    signalingRef.current?.close({ rejectPending: true })
    signalingRef.current = null
    connRef.current?.close()
    connRef.current = null
    roleRef.current = null
    seatRef.current = null
    remoteSeatRef.current = null
    bootstrapDoneRef.current = false
    setRole(null)
    setSeat(null)
    setRemoteSeat(null)
    setLocalSignal('')
    setRoomCode(null)
    setJoinUrl(null)
    setRemoteStream(null)
    setUseManualSignaling(false)
    setConnectionPath('unknown')
    setIceTier('local')
    updatePhase('idle')
    setError(null)
    setTransfer({ kind: null, received: 0, total: 0 })
    setConnectionState('idle')
    setRemoteReady(false)
    lastPongAtRef.current = null
    setLatencyMs(null)
  }, [updatePhase])

  return {
    phase,
    role,
    seat,
    sessionMode,
    connectionState,
    localSignal,
    roomCode,
    joinUrl,
    signalingPath,
    signalingLabel: formatSignalingPath(signalingPath),
    useManualSignaling,
    connectionPath,
    connectionPathLabel: formatConnectionPath(connectionPath),
    iceTier,
    remoteStream,
    transfer,
    error,
    remoteReady,
    latencyMs,
    latencyProfile,
    remoteSeat,
    pickSeat,
    isSeatAvailable,
    createHostOffer,
    acceptGuestAnswer,
    joinWithOffer,
    joinWithRoomCode,
    sendBootstrap,
    sendReady,
    sendGo,
    sendInput,
    sendPing,
    sendResyncState,
    sendResyncDone,
    requestResync,
    attachMediaStream,
    getConnection,
    disconnect,
    getSeat,
  }
}
