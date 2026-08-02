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
  getSignalingRoomMeta,
  MultiGuestRoomError,
  resolveJoinRoomMeta,
  type SignalingAdapterName,
} from '../lib/peer/signaling'
import { normalizeRoomCode } from '../lib/peer/joinUrl'
import { offerFingerprint, isMlineOrderError } from '../lib/peer/sdpUtils'
import { getPeerId, createSignalingGuestId } from '../lib/peer/peerId'
import {
  clampMaxPlayers,
  type MaxPlayers,
  type RosterEntry,
} from '../lib/peer/roster'
import { useMultiPeerHost } from './useMultiPeerHost'
import type { SystemId } from '../lib/cores'
import type { EmulatorSettings } from '../lib/settings'

export interface HostGameInfo {
  name: string
  system: SystemId
  core: string
  libraryFile?: string
}

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
  system?: 'nes' | 'snes' | null
  onRemoteInput?: (seat: PeerSeat, button: string, down: boolean, executeAt?: number) => void
  onBootstrap?: (payload: PeerBootstrapPayload) => void | Promise<void>
  onGo?: (resumeAt?: number) => void
  onHostExit?: () => void
  onResyncState?: (state: Uint8Array, compressed?: boolean) => void | Promise<void>
  onResyncRequest?: () => void
  onResyncStart?: () => void
  onResyncDone?: (resumeAt?: number) => void
  onPeerError?: (message: string) => void
  onLinked?: () => void
  onRemoteStream?: (stream: MediaStream) => void
  onHello?: (mode: SessionMode, seat: PeerSeat | null) => void
  onGuestHello?: () => void
  onGameUpdate?: (game: HostGameInfo) => void
  onRumble?: (seat: PeerSeat, pattern: number[]) => void
  onLatency?: (ms: number) => void
  /** Fired when local participation seat changes (including spectator). */
  onRoleChange?: (seat: PeerSeat | null) => void
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
  /** Seat claimed by the remote peer; null when remote is spectating or unknown. */
  remoteSeat: PeerSeat | null
  remoteSpectator: boolean
  connectionLost: boolean
  isSpectator: boolean
  multiGuest: boolean
  maxPlayers: MaxPlayers
  roster: RosterEntry[]
  peerId: string
  connectedGuestCount: number
  hostGame: HostGameInfo | null
  streamGeneration: number
  pickRole: (seat: PeerSeat | null) => boolean
  pickSeat: (seat: PeerSeat) => boolean
  isSeatAvailable: (seat: PeerSeat) => boolean
  createHostOffer: (
    mode?: SessionMode,
    opts?: { maxPlayers?: MaxPlayers; system?: 'nes' | 'snes' },
  ) => Promise<void>
  acceptGuestAnswer: (answer: string) => Promise<void>
  joinWithOffer: (offer: string, mode?: SessionMode, opts?: { asSpectator?: boolean }) => Promise<void>
  joinWithRoomCode: (
    code: string,
    mode: SessionMode,
    opts?: { asSpectator?: boolean; initialSeat?: PeerSeat | null },
  ) => Promise<void>
  sendBootstrap: (payload: {
    name: string
    system: SystemId
    core: string
    rom: Uint8Array
    state: Uint8Array
    libraryFile?: string
  }) => Promise<void>
  sendGameUpdate: (game: HostGameInfo) => void
  refreshMediaStream: () => void
  sendReady: () => void
  sendGo: () => void
  sendHostExit: () => void
  sendInput: (button: string, down: boolean, executeAt?: number) => void
  sendPing: (t: number) => void
  sendResyncState: (state: Uint8Array, compressed?: boolean) => Promise<void>
  sendResyncDone: (resumeAt?: number) => void
  requestResync: () => void
  attachMediaStream: (stream: MediaStream) => Promise<void>
  getConnection: () => PeerConnection | null
  reconnectSession: () => Promise<void>
  disconnect: () => void
  clearHostNotice: () => void
  /** Current seat from ref (always in sync with sendInput). */
  getSeat: () => PeerSeat | null
}

export function usePeerSession(options: UsePeerSessionOptions): UsePeerSessionResult {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const peerIdRef = useRef(getPeerId())
  const multiGuestRef = useRef(false)
  const maxPlayersRef = useRef<MaxPlayers>(2)

  const multiHost = useMultiPeerHost({
    hostPeerId: peerIdRef.current,
    onRemoteInput: (seat, button, down, executeAt) =>
      optionsRef.current.onRemoteInput?.(seat, button, down, executeAt),
    onGuestConnected: () => optionsRef.current.onGuestHello?.(),
    onError: (message) => optionsRef.current.onPeerError?.(message),
  })

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
  const reconnectInFlightRef = useRef(false)
  const signalingGuestIdRef = useRef<string | null>(null)
  const forceRelayRef = useRef(false)
  const remoteSpectatorRef = useRef(false)
  const joinedAsSpectatorRef = useRef(false)
  const onRoleChangeRef = useRef(options.onRoleChange)

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
  const [remoteSpectator, setRemoteSpectator] = useState(false)
  const [connectionLost, setConnectionLost] = useState(false)
  const [multiGuest, setMultiGuest] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState<MaxPlayers>(2)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [hostGame, setHostGame] = useState<HostGameInfo | null>(null)
  const [streamGeneration, setStreamGeneration] = useState(0)

  useEffect(() => {
    onRoleChangeRef.current = options.onRoleChange
  }, [options.onRoleChange])

  const isSpectator =
    role !== null && seat === null && connectionState === 'connected'

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
    if (!r) return
    try {
      conn.sendControl({
        type: 'hello',
        role: r,
        seat: s,
        mode: m,
        joinRole: s === null ? 'spectator' : 'player',
        peerId: peerIdRef.current,
      })
    } catch {
      // ignore
    }
  }, [])

  const applyGameUpdate = useCallback((game: HostGameInfo) => {
    setHostGame(game)
    setError((prev) => (prev === 'Host ended the game' ? null : prev))
    optionsRef.current.onGameUpdate?.(game)
  }, [])

  const applyRosterUpdate = useCallback(
    (
      peers: Array<{
        peerId: string
        role: 'host' | 'guest'
        seat: PeerSeat | null
        name?: string
        status?: 'connected' | 'connecting' | 'disconnected'
      }>,
      nextMax?: number,
    ) => {
      const entries: RosterEntry[] = peers.map((p) => ({
        peerId: p.peerId,
        role: p.role,
        seat: p.seat,
        name: p.name,
        status: p.status,
      }))
      setRoster(entries)
      if (nextMax) {
        maxPlayersRef.current = clampMaxPlayers(nextMax)
        setMaxPlayers(maxPlayersRef.current)
      }
      if (roleRef.current === 'guest') {
        const me = entries.find((e) => e.peerId === peerIdRef.current)
        if (me) {
          if (joinedAsSpectatorRef.current && me.seat !== null) {
            // Host roster may auto-list a seat before hello — keep spectator choice.
          } else if (me.status === 'connecting' && seatRef.current !== null) {
            // Guest picked a seat locally; host roster is still pending hello.
          } else {
            seatRef.current = me.seat
            setSeat(me.seat)
            onRoleChangeRef.current?.(me.seat)
          }
        }
      }
    },
    [],
  )

  const applyRemoteSeat = useCallback(
    (seat: PeerSeat | null, conn: PeerConnection) => {
      if (multiGuestRef.current) return
      if (seat !== null && seat === seatRef.current) {
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
      remoteSpectatorRef.current = seat === null
      setRemoteSpectator(seat === null)
      remoteSeatRef.current = seat
      setRemoteSeat(seat)
    },
    [sendHello],
  )

  const isSeatAvailable = useCallback(
    (seat: PeerSeat) => {
      if (roleRef.current === 'guest' && seat === 1) return false
      if (multiGuestRef.current) {
        if (roleRef.current === 'host') {
          return multiHost.isSeatAvailable(seat, peerIdRef.current)
        }
        return !roster.some((e) => e.seat === seat && e.peerId !== peerIdRef.current)
      }
      return remoteSeatRef.current !== seat
    },
    [multiHost, roster],
  )

  const pickRole = useCallback(
    (nextSeat: PeerSeat | null) => {
      if (multiGuestRef.current) {
        if (nextSeat !== null && !isSeatAvailable(nextSeat)) {
          setError(`Player ${nextSeat} is taken`)
          return false
        }
        setError(null)
        const prev = seatRef.current
        if (prev === nextSeat) return true
        seatRef.current = nextSeat
        setSeat(nextSeat)
        joinedAsSpectatorRef.current = nextSeat === null
        onRoleChangeRef.current?.(nextSeat)

        if (roleRef.current === 'host') {
          multiHost.setHostSeat(nextSeat)
        } else {
          const conn = connRef.current
          if (conn?.connected) {
            try {
              conn.sendControl({
                type: 'seat-claim',
                peerId: peerIdRef.current,
                seat: nextSeat,
              })
              sendHello(conn)
            } catch {
              // ignore
            }
          }
        }
        return true
      }

      if (nextSeat !== null && nextSeat > 2) return false
      if (nextSeat !== null && remoteSeatRef.current === nextSeat) {
        setError(`Player ${nextSeat} is taken by the other device`)
        return false
      }
      setError(null)
      const prev = seatRef.current
      if (prev === nextSeat) return true
      seatRef.current = nextSeat
      setSeat(nextSeat)
      joinedAsSpectatorRef.current = nextSeat === null
      onRoleChangeRef.current?.(nextSeat)
      const conn = connRef.current
      if (conn?.connected) {
        try {
          conn.sendControl({ type: 'seat-pick', seat: nextSeat })
          sendHello(conn)
        } catch {
          // ignore
        }
      }
      return true
    },
    [isSeatAvailable, multiHost, sendHello],
  )

  const pickSeat = useCallback(
    (seat: PeerSeat) => pickRole(seat),
    [pickRole],
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
      const guestId = signalingGuestIdRef.current
      if (guestId) {
        void chain?.sendGuestSessionMessage(guestId, payload)
      } else {
        chain?.sendSessionMessage(payload)
      }
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

  const markConnectionLost = useCallback((message: string) => {
    setConnectionLost(true)
    setError(message)
    optionsRef.current.onPeerError?.(message)
  }, [])

  const createConnection = useCallback((opts?: { preserveSession?: boolean }) => {
    connRef.current?.close()
    if (!opts?.preserveSession) {
      bootstrapDoneRef.current = false
      romBufRef.current = null
      stateBufRef.current = null
      bootstrapMetaRef.current = null
      remoteReadyRef.current = false
      setRemoteReady(false)
    }
    setRemoteStream(null)
    setConnectionPath('unknown')
    setIceTier(forceRelayRef.current ? 'relay' : 'local')

    const conn = new PeerConnection({
      onState: (state) => {
        setConnectionState(state)
        if (state === 'connected') {
          setError(null)
          setConnectionLost(false)
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
        } else if (state === 'disconnected') {
          markConnectionLost('Connection lost — tap Reconnect to resume')
        } else if (state === 'failed') {
          updatePhase('error')
          markConnectionLost('Peer connection failed')
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
        if (err.message.includes('DataChannel')) {
          markConnectionLost(err.message)
        } else {
          setError(err.message)
          optionsRef.current.onPeerError?.(err.message)
        }
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream)
        optionsRef.current.onRemoteStream?.(stream)
      },
      onControl: (msg) => {
        if (msg.type === 'hello') {
          modeRef.current = msg.mode
          setSessionMode(msg.mode)
          if (roleRef.current === 'host') {
            if (!multiGuestRef.current) {
              remoteSpectatorRef.current = msg.seat === null
              setRemoteSpectator(msg.seat === null)
              remoteSeatRef.current = msg.seat
              setRemoteSeat(msg.seat)
            }
            optionsRef.current.onGuestHello?.()
          } else {
            applyRemoteSeat(msg.seat, conn)
            optionsRef.current.onHello?.(msg.mode, msg.seat)
          }
        } else if (msg.type === 'seat-pick') {
          applyRemoteSeat(msg.seat, conn)
        } else if (msg.type === 'roster-update') {
          applyRosterUpdate(msg.peers, msg.maxPlayers)
        } else if (msg.type === 'game-update') {
          applyGameUpdate({
            name: msg.name,
            system: msg.system,
            core: msg.core,
            libraryFile: msg.libraryFile,
          })
        } else if (msg.type === 'bootstrap') {
          applyGameUpdate({
            name: msg.name,
            system: msg.system,
            core: msg.core,
            libraryFile: msg.libraryFile,
          })
          setError(null)
          remoteReadyRef.current = false
          setRemoteReady(false)
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
          setError(null)
          updatePhase('playing')
          optionsRef.current.onGo?.(msg.at)
        } else if (msg.type === 'host-exit') {
          updatePhase('linked')
          if (roleRef.current === 'guest') {
            setError('Host ended the game')
            optionsRef.current.onHostExit?.()
          }
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
          if (roleRef.current === 'guest' && seatRef.current === null) {
            return
          }
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
    }, {
      declareSendonlyMedia: roleRef.current === 'host' && modeRef.current === 'remote',
      forceRelay: forceRelayRef.current,
      iceTier: forceRelayRef.current ? 'relay' : 'local',
    })
    connRef.current = conn
    return conn
  }, [
    applyRemoteSeat,
    applyRosterUpdate,
    applyGameUpdate,
    handleRenegotiationAnswer,
    handleRenegotiationOffer,
    handleMediaRenegotiationAnswer,
    handleMediaRenegotiationOffer,
    publishRenegotiation,
    sendHello,
    updatePhase,
    markConnectionLost,
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

  useEffect(() => {
    if (multiGuest && role === 'host') {
      setRoster(multiHost.roster)
    }
  }, [multiGuest, role, multiHost.roster])

  const createHostOffer = useCallback(
    async (
      mode: SessionMode = modeRef.current,
      opts?: { maxPlayers?: MaxPlayers; system?: 'nes' | 'snes' },
    ) => {
      if (hostOfferInFlightRef.current) return
      hostOfferInFlightRef.current = true
      const generation = ++hostGenerationRef.current

      const playerCap = clampMaxPlayers(opts?.maxPlayers ?? 2)
      const useMultiGuest = mode === 'local' || mode === 'remote'

      setError(null)
      setConnectionLost(false)
      setLocalSignal('')
      setUseManualSignaling(false)
      modeRef.current = mode
      setSessionMode(mode)
      roleRef.current = 'host'
      seatRef.current = 1
      setRole('host')
      setSeat(1)
      multiGuestRef.current = useMultiGuest
      setMultiGuest(useMultiGuest)
      maxPlayersRef.current = playerCap
      setMaxPlayers(playerCap)

      try {
        signalingRef.current?.close()
        const chain = new SignalingAdapterChain()
        signalingRef.current = chain
        wireSignalingSession(chain)

        if (useMultiGuest) {
          connRef.current?.close()
          connRef.current = null
          const room = await chain.hostRoom('multi-guest', {
            mode,
            maxPlayers: playerCap,
            multiGuest: true,
          })
          if (generation !== hostGenerationRef.current) return

          setRoomCode(room.code)
          setJoinUrl(room.joinUrl)
          setSignalingPath(chain.lastAdapter)
          multiHost.start(chain, room.code, playerCap, {
            declareSendonlyMedia: mode === 'remote',
          })
          setRoster(multiHost.roster)
          setConnectionState('connected')
          updatePhase('linked')
          optionsRef.current.onLinked?.()
          optionsRef.current.onGo?.()
          return
        }

        const conn = createConnection()
        const offer = await conn.createOffer()
        const offerFp = offerFingerprint(offer)
        setLocalSignal(offer)

        const room = await chain.hostRoom(offer, { mode, maxPlayers: 2, multiGuest: false })
        if (generation !== hostGenerationRef.current) return

        setRoomCode(room.code)
        setJoinUrl(room.joinUrl)
        setSignalingPath(chain.lastAdapter)
        updatePhase('host-offer')

        const waitAnswer = async () => {
          const answer = await chain.waitForAnswer(room.code, undefined, offerFp)
          if (generation !== hostGenerationRef.current) return
          updatePhase('connecting')
          try {
            await conn.acceptAnswer(answer)
          } catch (err) {
            if (generation !== hostGenerationRef.current) return
            if (isMlineOrderError(err)) {
              chain.clearAnswer(room.code)
              setError('Guest answer was stale — waiting for a fresh answer…')
              updatePhase('host-offer')
              void waitAnswer()
              return
            }
            throw err
          }
        }
        void waitAnswer().catch((err) => {
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
    [createConnection, multiHost, updatePhase, wireSignalingSession],
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
    async (offer: string, mode: SessionMode = modeRef.current, opts?: { asSpectator?: boolean }) => {
      setError(null)
      setConnectionLost(false)
      setLocalSignal('')
      modeRef.current = mode
      setSessionMode(mode)
      roleRef.current = 'guest'
      const guestSeat = opts?.asSpectator ? null : 2
      seatRef.current = guestSeat
      setRole('guest')
      setSeat(guestSeat)
      const conn = createConnection()
      const answer = await conn.createAnswerFromOffer(offer)
      setLocalSignal(answer)
      updatePhase('guest-answer')
    },
    [createConnection, updatePhase],
  )

  const joinWithRoomCode = useCallback(
    async (
      code: string,
      mode: SessionMode,
      opts?: { asSpectator?: boolean; initialSeat?: PeerSeat | null },
    ) => {
      const normalized = normalizeRoomCode(code)
      if (!normalized) {
        setError('Enter a valid room code')
        return
      }

      setError(null)
      setConnectionLost(false)
      setRoomCode(normalized)
      modeRef.current = mode
      setSessionMode(mode)
      roleRef.current = 'guest'

      const roomMeta = resolveJoinRoomMeta(normalized, mode)
      let useMulti =
        (mode === 'local' || mode === 'remote') && Boolean(roomMeta?.multiGuest)
      const sameBrowserAsHost = Boolean(getSignalingRoomMeta(normalized))
      forceRelayRef.current = mode === 'remote' && !sameBrowserAsHost
      multiGuestRef.current = useMulti
      setMultiGuest(useMulti)
      if (roomMeta?.maxPlayers) {
        maxPlayersRef.current = clampMaxPlayers(roomMeta.maxPlayers)
        setMaxPlayers(maxPlayersRef.current)
      }

      const guestSeat =
        opts?.initialSeat !== undefined
          ? opts.initialSeat
          : opts?.asSpectator
            ? null
            : 2
      joinedAsSpectatorRef.current = guestSeat === null
      seatRef.current = guestSeat
      setRole('guest')
      setSeat(guestSeat)
      updatePhase('connecting')

      const offerTimeoutMs = mode === 'remote' || mode === 'coop' ? 20_000 : 30_000
      const maxAttempts = 4
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!signalingRef.current) {
          const chain = new SignalingAdapterChain()
          signalingRef.current = chain
          wireSignalingSession(chain)
        }
        const chain = signalingRef.current

        try {
          let offer: string
          let signalingId: string | undefined

          const joinAsMultiGuest = async () => {
            signalingId = createSignalingGuestId(peerIdRef.current)
            signalingGuestIdRef.current = signalingId
            return chain.joinRoomAsGuest(
              normalized,
              signalingId,
              peerIdRef.current,
              guestSeat,
              sameBrowserAsHost,
            )
          }

          try {
            if (useMulti) {
              offer = await joinAsMultiGuest()
            } else {
              offer = await chain.guestFetchOffer(normalized, offerTimeoutMs, peerIdRef.current)
            }
          } catch (fetchErr) {
            const tryMultiGuest =
              (mode === 'local' || mode === 'remote') &&
              !useMulti &&
              (fetchErr instanceof MultiGuestRoomError ||
                getSignalingRoomMeta(normalized)?.multiGuest)
            if (tryMultiGuest) {
              useMulti = true
              multiGuestRef.current = true
              setMultiGuest(true)
              const meta = getSignalingRoomMeta(normalized)
              if (meta?.maxPlayers) {
                maxPlayersRef.current = clampMaxPlayers(meta.maxPlayers)
                setMaxPlayers(maxPlayersRef.current)
              }
              offer = await joinAsMultiGuest()
            } else {
              throw fetchErr
            }
          }
          setSignalingPath(chain.lastAdapter)
          const conn = createConnection({ preserveSession: reconnectInFlightRef.current })
          const answer = await conn.createAnswerFromOffer(offer)
          const offerFp = offerFingerprint(offer)
          setLocalSignal(answer)
          if (useMulti && signalingId) {
            await chain.guestPublishAnswer(normalized, answer, signalingId, offerFp)
          } else {
            await chain.guestPublishAnswer(normalized, answer, undefined, offerFp)
          }
          updatePhase('guest-answer')
          return
        } catch (err) {
          signalingRef.current?.close({ rejectPending: true })
          signalingRef.current = null
          if (attempt < maxAttempts - 1) {
            setError(
              attempt === 0
                ? 'Host not reachable yet — retrying…'
                : `Still trying (${attempt + 1}/${maxAttempts})…`,
            )
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
            continue
          }
          setUseManualSignaling(mode !== 'remote')
          setSignalingPath('manual')
          const base = err instanceof Error ? err.message : 'Could not join room'
          setError(
            mode === 'remote'
              ? `${base} — ask the host to open Play with Friends, pick Remote, and create the room, then tap Reconnect`
              : `${base} — paste the host offer below`,
          )
          updatePhase('error')
        }
      }
    },
    [createConnection, updatePhase, wireSignalingSession],
  )

  const sendGameUpdate = useCallback((game: HostGameInfo) => {
    if (roleRef.current !== 'host') return
    const payload = {
      type: 'game-update' as const,
      name: game.name,
      system: game.system,
      core: game.core,
      libraryFile: game.libraryFile,
    }
    if (multiGuestRef.current) {
      multiHost.broadcastControl(payload)
      return
    }
    try {
      connRef.current?.sendControl(payload)
    } catch {
      // ignore
    }
  }, [multiHost])

  const refreshMediaStream = useCallback(() => {
    setStreamGeneration((n) => n + 1)
  }, [])

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
      remoteReadyRef.current = false
      setRemoteReady(false)
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

  const sendHostExit = useCallback(() => {
    const conn = connRef.current
    if (!conn?.connected || roleRef.current !== 'host') return
    try {
      conn.sendControl({ type: 'host-exit' })
      updatePhase('linked')
    } catch {
      // ignore
    }
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
      if (multiGuestRef.current) {
        await multiHost.attachMediaStream(stream)
        return
      }
      const conn = connRef.current
      if (!conn) throw new Error('No connection')
      const needsRenegotiation = conn.addMediaStream(stream)
      if (needsRenegotiation && roleRef.current === 'host') {
        const sdp = await conn.createMediaRenegotiationOffer()
        publishRenegotiation('media-reoffer', sdp)
      }
    },
    [multiHost, publishRenegotiation],
  )

  const getConnection = useCallback(() => connRef.current, [])

  const getSeat = useCallback(() => seatRef.current, [])

  const clearHostNotice = useCallback(() => {
    setError((prev) => (prev === 'Host ended the game' ? null : prev))
  }, [])

  const reconnectSession = useCallback(async () => {
    if (reconnectInFlightRef.current) return
    const r = roleRef.current
    const code = roomCode
    if (!r) {
      setError('No session to reconnect')
      return
    }

    reconnectInFlightRef.current = true
    setError(null)
    setConnectionLost(false)

    try {
      const existingConn = connRef.current

      if (r === 'host' && existingConn && !existingConn.connected) {
        const waitingForGuest =
          phaseRef.current === 'host-offer' &&
          existingConn.connectionState === 'awaiting-answer'
        if (!waitingForGuest) {
          try {
            const sdp = await existingConn.createIceRestartOffer()
            publishRenegotiation('ice-reoffer', sdp, existingConn.activeIceTier)
            await new Promise<void>((resolve) => {
              const started = Date.now()
              const check = () => {
                if (existingConn.connected) {
                  resolve()
                  return
                }
                if (Date.now() - started > 3000) {
                  resolve()
                  return
                }
                window.setTimeout(check, 200)
              }
              check()
            })
            if (existingConn.connected) return
          } catch {
            // fall through to full re-handshake
          }
        }
      }

      if (r === 'host') {
        if (!code) throw new Error('No room code — host a new session')
        const chain = signalingRef.current
        if (!chain) throw new Error('Signaling unavailable — disconnect and host again')

        if (multiGuestRef.current) {
          multiHost.stop()
          multiHost.start(chain, code, maxPlayersRef.current, {
            declareSendonlyMedia: modeRef.current === 'remote',
          })
          setConnectionLost(false)
          setConnectionState('connected')
          updatePhase('linked')
          return
        }

        existingConn?.softClose()
        const conn = createConnection({ preserveSession: true })
        const offer = await conn.createOffer()
        const offerFp = offerFingerprint(offer)
        setLocalSignal(offer)
        chain.clearAnswer(code)
        await chain.republishOffer(code, offer)
        updatePhase('host-offer')
        const answer = await chain.waitForAnswer(code, undefined, offerFp)
        await conn.acceptAnswer(answer)
        return
      }

      if (!code) throw new Error('No room code')
      existingConn?.softClose()
      reconnectInFlightRef.current = true
      await joinWithRoomCode(code, modeRef.current, {
        asSpectator: seatRef.current === null,
      })
    } catch (err) {
      markConnectionLost(err instanceof Error ? err.message : 'Reconnect failed')
    } finally {
      reconnectInFlightRef.current = false
    }
  }, [
    roomCode,
    createConnection,
    joinWithRoomCode,
    markConnectionLost,
    multiHost,
    publishRenegotiation,
    updatePhase,
  ])

  const disconnect = useCallback(() => {
    hostGenerationRef.current += 1
    hostOfferInFlightRef.current = false
    signalingSessionUnsubRef.current?.()
    signalingSessionUnsubRef.current = null
    signalingRef.current?.close({ rejectPending: true })
    signalingRef.current = null
    signalingGuestIdRef.current = null
    forceRelayRef.current = false
    multiHost.stop()
    connRef.current?.close()
    connRef.current = null
    roleRef.current = null
    seatRef.current = null
    remoteSeatRef.current = null
    remoteSpectatorRef.current = false
    joinedAsSpectatorRef.current = false
    multiGuestRef.current = false
    maxPlayersRef.current = 2
    bootstrapDoneRef.current = false
    setRole(null)
    setSeat(null)
    setRemoteSeat(null)
    setRemoteSpectator(false)
    setMultiGuest(false)
    setMaxPlayers(2)
    setRoster([])
    setHostGame(null)
    setStreamGeneration(0)
    setConnectionLost(false)
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
  }, [multiHost, updatePhase])

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
    remoteSpectator,
    connectionLost,
    isSpectator,
    multiGuest,
    maxPlayers,
    roster,
    peerId: peerIdRef.current,
    connectedGuestCount: multiHost.connectedGuestCount,
    hostGame,
    streamGeneration,
    pickRole,
    pickSeat,
    isSeatAvailable,
    createHostOffer,
    acceptGuestAnswer,
    joinWithOffer,
    joinWithRoomCode,
    sendBootstrap,
    sendGameUpdate,
    refreshMediaStream,
    sendReady,
    sendGo,
    sendHostExit,
    sendInput,
    sendPing,
    sendResyncState,
    sendResyncDone,
    requestResync,
    attachMediaStream,
    getConnection,
    reconnectSession,
    disconnect,
    clearHostNotice,
    getSeat,
  }
}
