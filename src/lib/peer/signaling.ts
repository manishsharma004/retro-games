import type { SessionMode } from './protocol'
import { buildJoinUrl, generateRoomCode, parseJoinLocation } from './joinUrl'

export type SignalingAdapterName = 'peerjs' | 'firebase' | 'broadcast' | 'manual'

export interface SignalingRoomMeta {
  mode: SessionMode
  hostName?: string
  maxPlayers?: 2 | 3 | 4 | 5
  multiGuest?: boolean
}

export interface SignalingAdapter {
  readonly name: SignalingAdapterName
  hostRoom(offer: string, meta: SignalingRoomMeta): Promise<{ code: string; joinUrl: string }>
  guestPublishAnswer(code: string, answer: string, guestId?: string): Promise<void>
  waitForAnswer(code: string, timeoutMs?: number, guestId?: string): Promise<string>
  guestFetchOffer(code: string, timeoutMs?: number, guestId?: string): Promise<string>
  joinRoomAsGuest?(code: string, guestId: string, timeoutMs?: number): Promise<string>
  publishGuestOffer?(code: string, guestId: string, offer: string): Promise<void>
  onGuestJoin?(handler: (guestId: string) => void): () => void
  republishOffer?(code: string, offer: string): Promise<void>
  clearAnswer?(code: string, guestId?: string): void
  sendSessionMessage?(data: unknown): void
  onSessionMessage?(handler: (data: unknown) => void): () => void
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
  guests?: Record<string, { offer?: string; answer?: string; joinedAt: number }>
  updatedAt: number
}

function waitForGuestField(
  code: string,
  guestId: string,
  field: 'offer' | 'answer',
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let bc: BroadcastChannel | null = null
    const check = () => {
      const rec = readRoom(code)
      const slot = rec?.guests?.[guestId]
      const value = field === 'offer' ? slot?.offer : slot?.answer
      if (value) {
        cleanup()
        resolve(value)
        return
      }
      if (Date.now() - started > timeoutMs) {
        cleanup()
        reject(new Error(`Timed out waiting for guest ${field}`))
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

function writeGuestSlot(
  code: string,
  guestId: string,
  patch: { offer?: string; answer?: string },
) {
  const prev = readRoom(code) ?? { updatedAt: Date.now() }
  const guests = { ...prev.guests }
  const slot = guests[guestId] ?? { joinedAt: Date.now() }
  guests[guestId] = { ...slot, ...patch, joinedAt: slot.joinedAt ?? Date.now() }
  writeRoom(code, { guests })
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

export function getSignalingRoomMeta(code: string): SignalingRoomMeta | null {
  return readRoom(code.trim().toUpperCase())?.meta ?? null
}

/** Room meta from localStorage (same browser) or join URL query params (cross-device). */
export function resolveJoinRoomMeta(
  code: string,
  mode: SessionMode,
  search = typeof window !== 'undefined' ? window.location.search : '',
): SignalingRoomMeta | null {
  const local = getSignalingRoomMeta(code)
  if (local) return local

  const { multiGuest, maxPlayers } = parseJoinLocation(search, '')
  if (multiGuest && mode === 'local') {
    return { mode, multiGuest: true, maxPlayers: maxPlayers ?? 5 }
  }
  return null
}

function joinUrlFromMeta(code: string, meta: SignalingRoomMeta) {
  return buildJoinUrl(code, meta.mode, {
    multiGuest: meta.multiGuest,
    maxPlayers: meta.maxPlayers,
  })
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
  private guestJoinHandlers = new Set<(guestId: string) => void>()
  private pendingGuestJoins = new Set<string>()
  private bc: BroadcastChannel | null = null

  constructor() {
    try {
      this.bc = new BroadcastChannel(BC_CHANNEL)
      this.bc.onmessage = (e) => {
        if (e.data?.type === 'guest-join' && typeof e.data.guestId === 'string') {
          this.notifyGuestJoin(e.data.guestId)
        }
      }
    } catch {
      // ignore
    }
  }

  private notifyGuestJoin(guestId: string) {
    if (this.guestJoinHandlers.size === 0) {
      this.pendingGuestJoins.add(guestId)
      return
    }
    for (const h of this.guestJoinHandlers) h(guestId)
  }

  onGuestJoin(handler: (guestId: string) => void) {
    this.guestJoinHandlers.add(handler)
    for (const guestId of this.pendingGuestJoins) handler(guestId)
    this.pendingGuestJoins.clear()
    return () => this.guestJoinHandlers.delete(handler)
  }

  async hostRoom(offer: string, meta: SignalingRoomMeta) {
    const code = generateRoomCode(4)
    this.codes.push(code)
    writeRoom(code, { offer, meta, answer: undefined, guests: {} })
    return { code, joinUrl: joinUrlFromMeta(code, meta) }
  }

  async guestPublishAnswer(code: string, answer: string, guestId?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer })
      return
    }
    writeRoom(code, { answer })
  }

  async waitForAnswer(code: string, timeoutMs = 120_000, guestId?: string) {
    if (guestId) return waitForGuestField(code, guestId, 'answer', timeoutMs)
    return waitForRoomField(code, 'answer', timeoutMs)
  }

  async guestFetchOffer(code: string, timeoutMs = 30_000, guestId?: string) {
    if (guestId) return waitForGuestField(code, guestId, 'offer', timeoutMs)
    const existing = readRoom(code)?.offer
    if (existing) return existing
    return waitForRoomField(code, 'offer', timeoutMs)
  }

  async joinRoomAsGuest(code: string, guestId: string, timeoutMs = 45_000) {
    writeGuestSlot(code, guestId, {})
    try {
      this.bc?.postMessage({ type: 'guest-join', guestId, code })
    } catch {
      // ignore
    }
    return waitForGuestField(code, guestId, 'offer', timeoutMs)
  }

  async publishGuestOffer(code: string, guestId: string, offer: string) {
    writeGuestSlot(code, guestId, { offer })
  }

  async republishOffer(code: string, offer: string) {
    writeRoom(code, { offer, answer: undefined })
  }

  clearAnswer(code: string, guestId?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer: undefined })
      return
    }
    writeRoom(code, { answer: undefined })
  }

  close(_opts?: { rejectPending?: boolean }) {
    for (const code of this.codes) {
      localStorage.removeItem(roomKey(code))
    }
    this.codes = []
    this.bc?.close()
    this.bc = null
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
    return { code, joinUrl: joinUrlFromMeta(code, meta) }
  }

  async guestPublishAnswer(code: string, answer: string, guestId?: string) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    if (guestId) {
      const res = await fetch(this.url(`rooms/${code}/guests/${guestId}/answer`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answer),
      })
      if (!res.ok) throw new Error('Firebase guest answer publish failed')
      return
    }
    const res = await fetch(this.url(`rooms/${code}/answer`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answer),
    })
    if (!res.ok) throw new Error('Firebase answer publish failed')
  }

  async waitForAnswer(code: string, timeoutMs = 120_000, guestId?: string) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const path = guestId ? `rooms/${code}/guests/${guestId}/answer` : `rooms/${code}/answer`
      const res = await fetch(this.url(path))
      if (res.ok) {
        const answer = await res.json()
        if (typeof answer === 'string' && answer.length > 0) return answer
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('Firebase answer timeout')
  }

  async guestFetchOffer(code: string, timeoutMs = 30_000, guestId?: string) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    if (guestId) {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        const res = await fetch(this.url(`rooms/${code}/guests/${guestId}/offer`))
        if (res.ok) {
          const offer = await res.json()
          if (typeof offer === 'string' && offer.length > 0) return offer
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      throw new Error('Firebase guest offer timeout')
    }
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

  async republishOffer(code: string, offer: string) {
    if (!this.enabled()) throw new Error('Firebase not configured')
    await fetch(this.url(`rooms/${code}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer }),
    })
    await fetch(this.url(`rooms/${code}/answer`), { method: 'DELETE' })
  }

  clearAnswer(code: string, guestId?: string) {
    if (!this.enabled()) return
    if (guestId) {
      void fetch(this.url(`rooms/${code}/guests/${guestId}/answer`), { method: 'DELETE' })
      return
    }
    void fetch(this.url(`rooms/${code}/answer`), { method: 'DELETE' })
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
  private sessionHandlers = new Set<(data: unknown) => void>()
  private latestOffer: string | null = null
  private latestMeta: SignalingRoomMeta | null = null
  private conns = new Map<string, DataConn>()
  private guestJoinHandlers = new Set<(guestId: string) => void>()
  private guestAnswerWaits = new Map<string, { resolve: (a: string) => void; reject: (e: Error) => void }>()
  private pendingGuestJoins = new Set<string>()

  private notifyGuestJoin(guestId: string) {
    if (this.guestJoinHandlers.size === 0) {
      this.pendingGuestJoins.add(guestId)
      return
    }
    for (const h of this.guestJoinHandlers) h(guestId)
  }

  private handleConnData(data: unknown, code: string, guestIdHint?: string) {
    const msg = data as {
      type?: string
      answer?: string
      offer?: string
      sdp?: string
      guestId?: string
    }
    const guestId = msg.guestId ?? guestIdHint

    if (msg.type === 'join-request' && guestId) {
      const conn = this.conns.get(guestId)
      if (conn) {
        this.notifyGuestJoin(guestId)
      }
      return
    }

    if (msg.type === 'webrtc-answer' && guestId && msg.answer) {
      writeGuestSlot(code, guestId, { answer: msg.answer })
      const wait = this.guestAnswerWaits.get(guestId)
      if (wait) {
        this.guestAnswerWaits.delete(guestId)
        wait.resolve(msg.answer)
      }
      return
    }

    if (msg.type === 'answer' && msg.answer) {
      writeRoom(code, { answer: msg.answer })
      this.deliverAnswer(msg.answer)
      return
    }
    if (msg.type === 'ice-reoffer' && msg.sdp) {
      this.emitSessionMessage(msg)
      return
    }
    if (msg.type === 'ice-reanswer' && msg.sdp) {
      this.emitSessionMessage(msg)
      return
    }
    if (msg.type === 'offer' && msg.offer) {
      this.emitSessionMessage(msg)
    }
  }

  private emitSessionMessage(data: unknown) {
    for (const handler of this.sessionHandlers) handler(data)
  }

  sendSessionMessage(data: unknown) {
    if (!this.conn?.open) return
    this.conn.send(data)
  }

  onSessionMessage(handler: (data: unknown) => void) {
    this.sessionHandlers.add(handler)
    return () => this.sessionHandlers.delete(handler)
  }

  onGuestJoin(handler: (guestId: string) => void) {
    this.guestJoinHandlers.add(handler)
    for (const guestId of this.pendingGuestJoins) handler(guestId)
    this.pendingGuestJoins.clear()
    return () => this.guestJoinHandlers.delete(handler)
  }

  async publishGuestOffer(code: string, guestId: string, offer: string) {
    writeGuestSlot(code, guestId, { offer })
    const conn = this.conns.get(guestId)
    if (conn?.open) conn.send({ type: 'webrtc-offer', guestId, offer })
  }

  async joinRoomAsGuest(code: string, guestId: string, timeoutMs = 45_000) {
    const normalized = code.trim().toUpperCase()
    const Peer = await this.loadPeer()
    const cfg = readPeerJsConfig()
    const peer = new Peer(cfg)
    this.peer = peer
    await waitPeerOpen(peer, 12_000)
    const conn = peer.connect(`rg-${normalized}`, { reliable: true })
    this.conn = conn
    this.conns.set(guestId, conn)

    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('PeerJS guest offer timeout')), timeoutMs)
      const onData = (data: unknown) => {
        const msg = data as { type?: string; offer?: string; guestId?: string }
        if (msg.type === 'webrtc-offer' && msg.offer && msg.guestId === guestId) {
          window.clearTimeout(timer)
          conn.off('data', onData)
          resolve(msg.offer)
          return
        }
        if (msg.type === 'offer' && msg.offer) {
          window.clearTimeout(timer)
          conn.off('data', onData)
          resolve(msg.offer)
        }
        this.handleConnData(data, normalized, guestId)
      }
      conn.on('data', onData)
      void waitConnOpen(conn, 12_000)
        .then(() => conn.send({ type: 'join-request', guestId }))
        .catch(() => {
          window.clearTimeout(timer)
          reject(new Error('PeerJS guest connection failed'))
        })
    })
  }

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
    this.latestOffer = offer
    this.latestMeta = meta

    // Same-browser / offline fallback while PeerJS broker is flaky.
    writeRoom(code, { offer, meta, answer: undefined, guests: {} })

    this.attachPeerLifecycle(peer)

    peer.on('connection', (conn) => {
      this.conn = conn
      let boundGuestId: string | null = null
      void waitConnOpen(conn, 12_000).then(() => {
        if (!meta.multiGuest) {
          const payload = {
            type: 'offer',
            offer: this.latestOffer ?? offer,
            meta: this.latestMeta ?? meta,
          }
          conn.send(payload)
        } else {
          conn.send({ type: 'room-meta', meta: this.latestMeta ?? meta })
        }
      })
      conn.on('data', (data: unknown) => {
        const msg = data as { type?: string; guestId?: string }
        if (msg.type === 'join-request' && msg.guestId) {
          boundGuestId = msg.guestId
          this.conns.set(msg.guestId, conn)
          this.notifyGuestJoin(msg.guestId)
        } else if (msg.type === 'guest-ready' && meta.multiGuest) {
          const guestId =
            msg.guestId ??
            boundGuestId ??
            `guest-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
          boundGuestId = guestId
          this.conns.set(guestId, conn)
          this.notifyGuestJoin(guestId)
        }
        this.handleConnData(data, code, boundGuestId ?? msg.guestId)
      })
    })

    await waitPeerOpen(peer, 12_000)

    return { code, joinUrl: joinUrlFromMeta(code, meta) }
  }

  async guestPublishAnswer(code: string, answer: string, guestId?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer })
      const conn = this.conns.get(guestId) ?? this.conn
      if (conn?.open) conn.send({ type: 'webrtc-answer', guestId, answer })
      return
    }
    writeRoom(code, { answer })
    if (!this.conn?.open) throw new Error('PeerJS guest connection not open')
    this.conn.send({ type: 'answer', answer })
  }

  async waitForAnswer(code: string, timeoutMs = 120_000, guestId?: string) {
    if (guestId) {
      const existing = readRoom(code)?.guests?.[guestId]?.answer
      if (existing) return existing
      return new Promise<string>((resolve, reject) => {
        this.guestAnswerWaits.set(guestId, { resolve, reject })
        window.setTimeout(() => {
          if (this.guestAnswerWaits.has(guestId)) {
            this.guestAnswerWaits.delete(guestId)
            reject(new Error('PeerJS guest answer timeout'))
          }
        }, timeoutMs)
      })
    }
    this.clearAnswerWait()

    const existing = readRoom(code)?.answer
    if (existing) return existing

    if (this.pendingAnswer) {
      const answer = this.pendingAnswer
      this.pendingAnswer = null
      return answer
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

  async republishOffer(code: string, offer: string) {
    this.latestOffer = offer
    writeRoom(code, { offer, answer: undefined })
    this.pendingAnswer = null
    this.clearAnswerWait()
    if (this.conn?.open) {
      this.conn.send({ type: 'offer', offer, meta: this.latestMeta })
    }
  }

  clearAnswer(code: string, guestId?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer: undefined })
      return
    }
    writeRoom(code, { answer: undefined })
    this.pendingAnswer = null
    this.clearAnswerWait()
  }

  async guestFetchOffer(code: string, timeoutMs = 45_000, guestId?: string) {
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
        const msg = data as {
          type?: string
          offer?: string
          sdp?: string
          guestId?: string
          meta?: SignalingRoomMeta
        }
        if (msg.type === 'offer' && msg.offer) {
          window.clearTimeout(timer)
          resolve(msg.offer)
          return
        }
        if (msg.type === 'webrtc-offer' && msg.offer) {
          window.clearTimeout(timer)
          resolve(msg.offer)
          return
        }
        if (msg.type === 'room-meta' && msg.meta) {
          writeRoom(normalized, { meta: msg.meta })
        }
        this.handleConnData(data, normalized)
      })
      void waitConnOpen(conn, 12_000)
        .then(() =>
          conn.send(guestId ? { type: 'guest-ready', guestId } : { type: 'guest-ready' }),
        )
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
    this.sessionHandlers.clear()
    for (const conn of this.conns.values()) conn.close()
    this.conns.clear()
    this.guestJoinHandlers.clear()
    this.guestAnswerWaits.clear()
    this.pendingGuestJoins.clear()
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

  async guestFetchOffer(code: string, timeoutMs?: number, guestId?: string) {
    // Guest always tries PeerJS first (cross-device default).
    const order = [
      this.adapters.find((a) => a.name === 'peerjs'),
      ...this.adapters.filter((a) => a.name !== 'peerjs'),
    ].filter(Boolean) as SignalingAdapter[]

    for (const adapter of order) {
      try {
        this.active = adapter
        const offer = await adapter.guestFetchOffer(code, timeoutMs, guestId)
        this.lastAdapter = adapter.name
        return offer
      } catch {
        adapter.close()
      }
    }
    this.lastAdapter = 'manual'
    throw new Error('Could not fetch offer — try manual SDP paste')
  }

  async guestPublishAnswer(code: string, answer: string, guestId?: string) {
    if (this.active) {
      await this.active.guestPublishAnswer(code, answer, guestId)
      return
    }
    for (const adapter of this.adapters) {
      try {
        await adapter.guestPublishAnswer(code, answer, guestId)
        this.active = adapter
        return
      } catch {
        adapter.close()
      }
    }
  }

  async joinRoomAsGuest(code: string, guestId: string) {
    const order = [
      this.adapters.find((a) => a.name === 'peerjs'),
      this.broadcastAdapter,
      ...this.adapters.filter((a) => a.name !== 'peerjs' && a.name !== 'broadcast'),
    ].filter(Boolean) as SignalingAdapter[]

    for (const adapter of order) {
      if (!adapter.joinRoomAsGuest) continue
      try {
        this.active = adapter
        const offer = await adapter.joinRoomAsGuest(code, guestId)
        this.lastAdapter = adapter.name
        return offer
      } catch {
        adapter.close()
      }
    }
    throw new Error('Could not join room as guest')
  }

  async publishGuestOffer(code: string, guestId: string, offer: string) {
    if (this.active?.publishGuestOffer) {
      await this.active.publishGuestOffer(code, guestId, offer)
      return
    }
    await this.broadcastAdapter.publishGuestOffer!(code, guestId, offer)
  }

  onGuestJoin(handler: (guestId: string) => void) {
    const unsubs: Array<() => void> = []
    for (const adapter of this.adapters) {
      const unsub = adapter.onGuestJoin?.(handler)
      if (unsub) unsubs.push(unsub)
    }
    const broadcastUnsub = this.broadcastAdapter.onGuestJoin(handler)
    unsubs.push(broadcastUnsub)
    return () => {
      for (const u of unsubs) u()
    }
  }

  sendSessionMessage(data: unknown) {
    this.active?.sendSessionMessage?.(data)
  }

  onSessionMessage(handler: (data: unknown) => void) {
    const unsubs = this.adapters
      .map((adapter) => adapter.onSessionMessage?.(handler))
      .filter(Boolean) as Array<() => void>
    return () => {
      for (const unsub of unsubs) unsub()
    }
  }

  async waitForAnswer(code: string, guestId?: string) {
    const waits: Promise<string>[] = []

    if (this.active) {
      waits.push(this.active.waitForAnswer(code, 120_000, guestId))
    }

    if (this.active?.name === 'peerjs' && !guestId) {
      waits.push(this.broadcastAdapter.waitForAnswer(code))
    }

    if (guestId && this.broadcastAdapter) {
      waits.push(this.broadcastAdapter.waitForAnswer(code, 120_000, guestId))
    }

    if (waits.length === 0) {
      for (const adapter of this.adapters) {
        try {
          return await adapter.waitForAnswer(code, 120_000, guestId)
        } catch {
          adapter.close()
        }
      }
      throw new Error('Answer timeout')
    }

    return Promise.race(waits)
  }

  async republishOffer(code: string, offer: string) {
    if (this.active?.republishOffer) {
      await this.active.republishOffer(code, offer)
      return
    }
    await this.broadcastAdapter.republishOffer!(code, offer)
  }

  clearAnswer(code: string, guestId?: string) {
    this.active?.clearAnswer?.(code, guestId)
    this.broadcastAdapter.clearAnswer?.(code, guestId)
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
