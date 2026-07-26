import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PeerConnection,
  pickSyncSettings,
  type PeerConnectionState,
  type PeerRole,
  type PeerSeat,
  type PeerSyncSettings,
} from '../lib/peer'
import type { SystemId } from '../lib/cores'
import type { EmulatorSettings } from '../lib/settings'

export type PeerPhase =
  | 'idle'
  | 'host-offer'
  | 'guest-answer'
  | 'connecting'
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
  onRemoteInput?: (seat: PeerSeat, button: string, down: boolean) => void
  onBootstrap?: (payload: PeerBootstrapPayload) => void | Promise<void>
  onGo?: () => void
  onResyncState?: (state: Uint8Array) => void | Promise<void>
  onResyncRequest?: () => void
  onPeerError?: (message: string) => void
}

export interface UsePeerSessionResult {
  phase: PeerPhase
  role: PeerRole | null
  seat: PeerSeat | null
  connectionState: PeerConnectionState
  localSignal: string
  transfer: PeerTransferStatus
  error: string | null
  remoteReady: boolean
  createHostOffer: () => Promise<void>
  acceptGuestAnswer: (answer: string) => Promise<void>
  joinWithOffer: (offer: string) => Promise<void>
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
  sendInput: (button: string, down: boolean) => void
  sendResyncState: (state: Uint8Array) => Promise<void>
  requestResync: () => void
  disconnect: () => void
}

export function usePeerSession(options: UsePeerSessionOptions): UsePeerSessionResult {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const connRef = useRef<PeerConnection | null>(null)
  const roleRef = useRef<PeerRole | null>(null)
  const seatRef = useRef<PeerSeat | null>(null)
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

  const [phase, setPhase] = useState<PeerPhase>('idle')
  const [role, setRole] = useState<PeerRole | null>(null)
  const [seat, setSeat] = useState<PeerSeat | null>(null)
  const [connectionState, setConnectionState] = useState<PeerConnectionState>('idle')
  const [localSignal, setLocalSignal] = useState('')
  const [transfer, setTransfer] = useState<PeerTransferStatus>({
    kind: null,
    received: 0,
    total: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [remoteReady, setRemoteReady] = useState(false)

  const updatePhase = useCallback((next: PeerPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const createConnection = useCallback(() => {
    connRef.current?.close()
    bootstrapDoneRef.current = false
    romBufRef.current = null
    stateBufRef.current = null
    bootstrapMetaRef.current = null
    remoteReadyRef.current = false
    setRemoteReady(false)

    const conn = new PeerConnection({
      onState: (state) => {
        setConnectionState(state)
        if (state === 'connected') {
          if (
            phaseRef.current !== 'playing' &&
            phaseRef.current !== 'ready-wait' &&
            phaseRef.current !== 'transferring'
          ) {
            updatePhase('connecting')
          }
          window.setTimeout(() => {
            const r = roleRef.current
            const s = seatRef.current
            if (r && s && conn.connected) {
              try {
                conn.sendControl({ type: 'hello', role: r, seat: s })
              } catch {
                // ignore
              }
            }
          }, 0)
        } else if (state === 'failed') {
          updatePhase('error')
          setError((prev) => prev ?? 'Peer connection failed')
        } else if (state === 'awaiting-answer') {
          // Keep host-offer / guest-answer UI — do not treat ICE noise as failure.
          if (roleRef.current === 'host' && phaseRef.current === 'connecting') {
            updatePhase('host-offer')
          }
        }
      },
      onError: (err) => {
        setError(err.message)
        optionsRef.current.onPeerError?.(err.message)
      },
      onControl: (msg) => {
        if (msg.type === 'bootstrap') {
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
          optionsRef.current.onRemoteInput?.(msg.seat, msg.button, msg.down)
        } else if (msg.type === 'ready') {
          remoteReadyRef.current = true
          setRemoteReady(true)
        } else if (msg.type === 'go') {
          updatePhase('playing')
          optionsRef.current.onGo?.()
        } else if (msg.type === 'resync-request') {
          optionsRef.current.onResyncRequest?.()
        } else if (msg.type === 'ping') {
          try {
            conn.sendControl({ type: 'pong', t: msg.t })
          } catch {
            // ignore
          }
        }
      },
      onTransferProgress: ({ kind, received, total }) => {
        setTransfer({ kind, received, total })
        if (!bootstrapDoneRef.current) updatePhase('transferring')
      },
      onTransferComplete: ({ kind, data }) => {
        if (bootstrapDoneRef.current && kind === 'state') {
          void optionsRef.current.onResyncState?.(data)
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
  }, [updatePhase])

  useEffect(() => {
    return () => {
      connRef.current?.close()
      connRef.current = null
    }
  }, [])

  const createHostOffer = useCallback(async () => {
    setError(null)
    setLocalSignal('')
    roleRef.current = 'host'
    seatRef.current = 1
    setRole('host')
    setSeat(1)
    const conn = createConnection()
    const offer = await conn.createOffer()
    setLocalSignal(offer)
    updatePhase('host-offer')
  }, [createConnection, updatePhase])

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
    async (offer: string) => {
      setError(null)
      setLocalSignal('')
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
    const conn = connRef.current
    if (!conn?.connected) return
    conn.sendControl({ type: 'ready' })
  }, [])

  const sendGo = useCallback(() => {
    const conn = connRef.current
    if (!conn?.connected) return
    conn.sendControl({ type: 'go', at: Date.now() })
    updatePhase('playing')
    optionsRef.current.onGo?.()
  }, [updatePhase])

  const sendInput = useCallback((button: string, down: boolean) => {
    const conn = connRef.current
    const s = seatRef.current
    if (!conn?.connected || !s) return
    if (phaseRef.current !== 'playing') return
    try {
      conn.sendControl({ type: 'input', seat: s, button, down, t: Date.now() })
    } catch {
      // ignore
    }
  }, [])

  const sendResyncState = useCallback(async (state: Uint8Array) => {
    const conn = connRef.current
    if (!conn?.connected) return
    await conn.sendBlob('state', state)
  }, [])

  const requestResync = useCallback(() => {
    const conn = connRef.current
    if (!conn?.connected) return
    conn.sendControl({ type: 'resync-request' })
  }, [])

  const disconnect = useCallback(() => {
    connRef.current?.close()
    connRef.current = null
    roleRef.current = null
    seatRef.current = null
    bootstrapDoneRef.current = false
    setRole(null)
    setSeat(null)
    setLocalSignal('')
    updatePhase('idle')
    setError(null)
    setTransfer({ kind: null, received: 0, total: 0 })
    setConnectionState('idle')
    setRemoteReady(false)
  }, [updatePhase])

  return {
    phase,
    role,
    seat,
    connectionState,
    localSignal,
    transfer,
    error,
    remoteReady,
    createHostOffer,
    acceptGuestAnswer,
    joinWithOffer,
    sendBootstrap,
    sendReady,
    sendGo,
    sendInput,
    sendResyncState,
    requestResync,
    disconnect,
  }
}
