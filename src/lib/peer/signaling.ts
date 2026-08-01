import type { SessionMode } from './protocol'
import { buildJoinUrl, generateRoomCode } from './joinUrl'

export type SignalingAdapterName = 'peerjs' | 'firebase' | 'broadcast' | 'manual'

export interface SignalingRoomMeta {
  mode: SessionMode
  hostName?: string
}

export interface SignalingAdapter {
  readonly name: SignalingAdapterName
  hostRoom(offer: string, meta: SignalingRoomMeta): Promise<{ code: string; joinUrl: string }>
  guestPublishAnswer(code: string, answer: string): Promise<void>
  waitForAnswer(code: string, timeoutMs?: number): Promise<string>
  guestFetchOffer(code: string, timeoutMs?: number): Promise<string>
  close(opts?: { rejectPending?: boolean }): void
}

/** Free public PeerJS cloud broker — default signaling path, no API key required. */
export const DEFAULT_PEERJS_CONFIG = {
  host: '0.peerjs.com',
  secure: true,
  port: 443,
  path: '/',
} as const

const ROOM_TTL_MS = 5 * 60 * 1000
const BC_CHANNEL = 'retro-games-lobby'

type RoomRecord = {
  offer?: string
  answer?: string
  meta?: SignalingRoomMeta
  updatedAt: number
}

function roomKey(code: string): string {
  return `retro-games-room-${code}`
}

function writeRoom(code: string, patch: Partial<RoomRecord>) {
  const prev: RoomRecord = JSON.parse(localStorage.getItem(roomKey(code)) ?? '{}')
  const next: RoomRecord = { ...prev, ...patch, updatedAt: Date.now() }
  localStorage.setItem(roomKey(code), JSON.stringify(next))
  try {
    const bc = new BroadcastChannel(BC_CHANNEL)
    bc.postMessage({ type: 'room-update', code })
    bc.close()
  } catch {
    // ignore
  }
}

function readRoom(code: string): RoomRecord | null {
  const raw = localStorage.getItem(roomKey(code))
  if (!raw) return null
  try {
    const rec = JSON.parse(raw) as RoomRecord
    if (Date.now() - rec.updatedAt > ROOM_TTL_MS) {
      localStorage.removeItem(roomKey(code))
      return null
    }
    return rec
  } catch {
    return null
  }
}

function waitForRoomField(
  code: string,
  field: 'offer' | 'answer',
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let bc: BroadcastChannel | null = null

    const check = () => {
      const rec = readRoom(code)
      const value = rec?.[field]
      if (value) {
        cleanup()
        resolve(value)
        return
      }
      if (Date.now() - started > timeoutMs) {
        cleanup()
        reject(new Error(`Timed out waiting for ${field}`))
        return
      }
      window.setTimeout(check, 400)
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === roomKey(code)) check()
    }

    const onBc = (e: MessageEvent) => {
      if (e.data?.type === 'room-update' && e.data?.code === code) check()
    }

    const cleanup = () => {
      window.removeEventListener('storage', onStorage)
      bc?.close()
    }

    window.addEventListener('storage', onStorage)
    try {
      bc = new BroadcastChannel(BC_CHANNEL)
      bc.onmessage = onBc
    } catch {
      // polling only
    }
    check()
  })
}

function readPeerJsConfig() {
  const host = (import.meta.env.VITE_PEERJS_HOST as string | undefined) ?? DEFAULT_PEERJS_CONFIG.host
  const port = Number(import.meta.env.VITE_PEERJS_PORT ?? DEFAULT_PEERJS_CONFIG.port)
  const path = (import.meta.env.VITE_PEERJS_PATH as string | undefined) ?? DEFAULT_PEERJS_CONFIG.path
  const secure = import.meta.env.VITE_PEERJS_SECURE !== 'false'
  return { host, port, path, secure }
}

type PeerJsModule = typeof import('peerjs').default
type PeerInstance = InstanceType<PeerJsModule>
type DataConn = import('peerjs').DataConnection

function waitPeerOpen(peer: PeerInstance, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (peer.open) {
      resolve()
      return
    }
    const timer = window.setTimeout(() => reject(new Error('PeerJS open timeout')), timeoutMs)
    peer.once('open', () => {
      window.clearTimeout(timer)
      resolve()
    })
    peer.once('error', (err) => {
      window.clearTimeout(timer)
      reject(err)
    })
  })
}

function waitConnOpen(conn: DataConn, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (conn.open) {
      resolve()
      return
    }
    const timer = window.setTimeout(() => reject(new Error('PeerJS connection timeout')), timeoutMs)
    conn.once('open', () => {
      window.clearTimeout(timer)
      resolve()
    })
    conn.once('error', (err) => {
      window.clearTimeout(timer)
      reject(err)
    })
  })
}

/** Same-origin room exchange via localStorage + BroadcastChannel (same browser / dev). */
export class BroadcastSignalingAdapter implements SignalingAdapter {
  readonly name = 'broadcast' as const
  private codes: string[] = []

  async hostRoom(offer: string, meta: SignalingRoomMeta) {
    const code = generateRoomCode(4)
    this.codes.push(code)
    writeRoom(code, { offer, meta, answer: undefined })
    return { code, joinUrl: buildJoinUrl(code, meta.mode) }
  }

  async guestPublishAnswer(code: string, answer: string) {
    writeRoom(code, { answer })
  }

  async waitForAnswer(code: string, timeoutMs = 120_000) {
    return waitForRoomField(code, 'answer', timeoutMs)
  }

  async guestFetchOffer(code: string, timeoutMs = 30_000) {
    const existing = readRoom(code)?.offer
    if (existing) return existing
    return waitForRoomField(code, 'offer', timeoutMs)
  }

  close(_opts?: { rejectPending?: boolean }) {
    for (const code of this.codes) {
      localStorage.removeItem(roomKey(code))
    }
    this.codes = []
  }
}

/** Optional Firebase REST signaling when env vars are set. */
export class FirebaseSignalingAdapter implements SignalingAdapter {
  readonly name = 'firebase' as const
  private databaseUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined
  private apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  private activeCode: string | null = null

  private enabled(): boolean {
    return Boolean(this.databaseUrl && this.apiKey)
  }

  private url(path: string): string {
    return `${this.databaseUrl!.replace(/\/$/, '')}/${path}.json?auth=${this.apiKey}`
  }

  async hostRoom(offer: string, meta: SignalingRoomMeta) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    const code = generateRoomCode(4)
    this.activeCode = code
    const res = await fetch(this.url(`rooms/${code}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer, meta, createdAt: Date.now() }),
    })
    if (!res.ok) throw new Error('Firebase room create failed')
    return { code, joinUrl: buildJoinUrl(code, meta.mode) }
  }

  async guestPublishAnswer(code: string, answer: string) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    const res = await fetch(this.url(`rooms/${code}/answer`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answer),
    })
    if (!res.ok) throw new Error('Firebase answer publish failed')
  }

  async waitForAnswer(code: string, timeoutMs = 120_000) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const res = await fetch(this.url(`rooms/${code}/answer`))
      if (res.ok) {
        const answer = await res.json()
        if (typeof answer === 'string' && answer.length > 0) return answer
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('Firebase answer timeout')
  }

  async guestFetchOffer(code: string, timeoutMs = 30_000) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const res = await fetch(this.url(`rooms/${code}`))
      if (res.ok) {
        const data = (await res.json()) as { offer?: string } | null
        if (data?.offer) return data.offer
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('Firebase offer timeout')
  }

  close(_opts?: { rejectPending?: boolean }) {
    if (this.activeCode && this.enabled()) {
      void fetch(this.url(`rooms/${this.activeCode}`), { method: 'DELETE' })
    }
    this.activeCode = null
  }
}

/**
 * Free PeerJS cloud broker (0.peerjs.com) — cross-device SDP exchange over
 * PeerJS DataConnections. This is the default signaling path.
 */
export class PeerJSSignalingAdapter implements SignalingAdapter {
  readonly name = 'peerjs' as const
  private peer: PeerInstance | null = null
  private conn: DataConn | null = null
  private answerResolve: ((answer: string) => void) | null = null
  private answerReject: ((err: Error) => void) | null = null
  private pendingAnswer: string | null = null
  private answerTimer: number | null = null
  private hostCode: string | null = null
  private disconnecting = false

  private deliverAnswer(answer: string) {
    if (this.answerResolve) {
      const resolve = this.answerResolve
      this.clearAnswerWait()
      resolve(answer)
    } else {
      this.pendingAnswer = answer
    }
  }

  private clearAnswerWait() {
    if (this.answerTimer !== null) {
      window.clearTimeout(this.answerTimer)
      this.answerTimer = null
    }
    this.answerResolve = null
    this.answerReject = null
  }

  private attachPeerLifecycle(peer: PeerInstance) {
    peer.on('disconnected', () => {
      if (this.disconnecting || !this.peer) return
      try {
        peer.reconnect()
      } catch {
        // broker may already be reconnecting
      }
    })
    peer.on('close', () => {
      if (this.disconnecting) return
      // Broker dropped the session — try once more before giving up.
      if (this.hostCode && this.peer === peer) {
        try {
          peer.reconnect()
        } catch {
          // ignore
        }
      }
    })
  }

  private async loadPeer(): Promise<PeerJsModule> {
    const mod = await import('peerjs')
    return mod.default
  }

  async hostRoom(offer: string, meta: SignalingRoomMeta) {
    const Peer = await this.loadPeer()
    const code = generateRoomCode(4)
    const cfg = readPeerJsConfig()
    const peer = new Peer(`rg-${code}`, cfg)
    this.peer = peer
    this.hostCode = code

    // Same-browser / offline fallback while PeerJS broker is flaky.
    writeRoom(code, { offer, meta, answer: undefined })

    this.attachPeerLifecycle(peer)

    peer.on('connection', (conn) => {
      this.conn = conn
      void waitConnOpen(conn, 12_000).then(() => {
        conn.send({ type: 'offer', offer, meta })
      })
      conn.on('data', (data: unknown) => {
        const msg = data as { type?: string; answer?: string }
        if (msg.type === 'answer' && msg.answer) {
          writeRoom(code, { answer: msg.answer })
          this.deliverAnswer(msg.answer)
        }
      })
    })

    await waitPeerOpen(peer, 12_000)

    return { code, joinUrl: buildJoinUrl(code, meta.mode) }
  }

  async guestPublishAnswer(code: string, answer: string) {
    writeRoom(code, { answer })
    if (!this.conn?.open) throw new Error('PeerJS guest connection not open')
    this.conn.send({ type: 'answer', answer })
  }

  async waitForAnswer(code: string, timeoutMs = 120_000) {
    const existing = readRoom(code)?.answer
    if (existing) return existing

    if (this.pendingAnswer) {
      const answer = this.pendingAnswer
      this.pendingAnswer = null
      return answer
    }
    if (this.answerResolve) {
      throw new Error('Already waiting for answer')
    }
    return new Promise<string>((resolve, reject) => {
      this.answerResolve = resolve
      this.answerReject = reject
      this.answerTimer = window.setTimeout(() => {
        if (this.answerResolve === resolve) {
          this.clearAnswerWait()
          reject(new Error('PeerJS answer timeout'))
        }
      }, timeoutMs)
    })
  }

  async guestFetchOffer(code: string, timeoutMs = 45_000) {
    const normalized = code.trim().toUpperCase()
    const Peer = await this.loadPeer()
    const cfg = readPeerJsConfig()
    const peer = new Peer(cfg)
    this.peer = peer
    await waitPeerOpen(peer, 12_000)
    const conn = peer.connect(`rg-${normalized}`, { reliable: true })
    this.conn = conn

    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('PeerJS offer timeout')), timeoutMs)
      conn.on('data', (data: unknown) => {
        const msg = data as { type?: string; offer?: string }
        if (msg.type === 'offer' && msg.offer) {
          window.clearTimeout(timer)
          resolve(msg.offer)
        }
      })
      void waitConnOpen(conn, 12_000)
        .then(() => conn.send({ type: 'guest-ready' }))
        .catch(() => {
          window.clearTimeout(timer)
          reject(new Error('PeerJS guest connection failed'))
        })
    })
  }

  close(opts?: { rejectPending?: boolean }) {
    this.disconnecting = true
    if (opts?.rejectPending) {
      this.answerReject?.(new Error('PeerJS closed'))
    }
    this.clearAnswerWait()
    this.pendingAnswer = null
    this.conn?.close()
    this.peer?.destroy()
    this.conn = null
    this.peer = null
    this.hostCode = null
    this.disconnecting = false
  }
}

const ADAPTER_TIMEOUT_MS: Record<SignalingAdapterName, number> = {
  peerjs: 15_000,
  firebase: 8_000,
  broadcast: 3_000,
  manual: 0,
}

export class SignalingAdapterChain {
  private adapters: SignalingAdapter[] = []
  private active: SignalingAdapter | null = null
  private broadcastAdapter: BroadcastSignalingAdapter
  lastAdapter: SignalingAdapterName = 'peerjs'
  lastError: string | null = null

  constructor() {
    // Free public servers first — no API keys required.
    this.adapters.push(new PeerJSSignalingAdapter())
    this.broadcastAdapter = new BroadcastSignalingAdapter()
    this.adapters.push(this.broadcastAdapter)

    const firebase = new FirebaseSignalingAdapter()
    if (import.meta.env.VITE_FIREBASE_DATABASE_URL && import.meta.env.VITE_FIREBASE_API_KEY) {
      this.adapters.push(firebase)
    }
  }

  private async raceAdapter<T>(
    adapter: SignalingAdapter,
    run: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: number | null = null
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = window.setTimeout(
            () => reject(new Error(`${adapter.name} timeout`)),
            timeoutMs,
          )
        }),
      ])
    } finally {
      if (timer !== null) window.clearTimeout(timer)
    }
  }

  async hostRoom(offer: string, meta: SignalingRoomMeta) {
    for (const adapter of this.adapters) {
      const timeoutMs = ADAPTER_TIMEOUT_MS[adapter.name]
      try {
        const result = await this.raceAdapter(adapter, () => adapter.hostRoom(offer, meta), timeoutMs)
        this.active = adapter
        this.lastAdapter = adapter.name
        this.lastError = null
        return result
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : 'signaling failed'
        adapter.close()
      }
    }
    this.lastAdapter = 'manual'
    throw new Error('All signaling adapters failed — use manual SDP paste')
  }

  async guestFetchOffer(code: string) {
    // Guest always tries PeerJS first (cross-device default).
    const order = [
      this.adapters.find((a) => a.name === 'peerjs'),
      ...this.adapters.filter((a) => a.name !== 'peerjs'),
    ].filter(Boolean) as SignalingAdapter[]

    for (const adapter of order) {
      try {
        this.active = adapter
        const offer = await adapter.guestFetchOffer(code)
        this.lastAdapter = adapter.name
        return offer
      } catch {
        adapter.close()
      }
    }
    this.lastAdapter = 'manual'
    throw new Error('Could not fetch offer — try manual SDP paste')
  }

  async guestPublishAnswer(code: string, answer: string) {
    if (this.active) {
      await this.active.guestPublishAnswer(code, answer)
      return
    }
    for (const adapter of this.adapters) {
      try {
        await adapter.guestPublishAnswer(code, answer)
        this.active = adapter
        return
      } catch {
        adapter.close()
      }
    }
  }

  async waitForAnswer(code: string) {
    const waits: Promise<string>[] = []

    if (this.active) {
      waits.push(this.active.waitForAnswer(code))
    }

    // PeerJS host also mirrors the offer to localStorage — listen there too.
    if (this.active?.name === 'peerjs') {
      waits.push(this.broadcastAdapter.waitForAnswer(code))
    }

    if (waits.length === 0) {
      for (const adapter of this.adapters) {
        try {
          return await adapter.waitForAnswer(code)
        } catch {
          adapter.close()
        }
      }
      throw new Error('Answer timeout')
    }

    return Promise.race(waits)
  }

  close(opts?: { rejectPending?: boolean }) {
    this.active?.close(opts)
    this.active = null
  }
}

export function formatSignalingPath(name: SignalingAdapterName): string {
  switch (name) {
    case 'peerjs':
      return 'Room code (free PeerJS relay)'
    case 'firebase':
      return 'Room code (Firebase)'
    case 'broadcast':
      return 'Room code (same browser)'
    case 'manual':
      return 'Manual SDP paste'
  }
}
