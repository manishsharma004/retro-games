import type { SessionMode } from './protocol'
import { buildJoinUrl, generateRoomCode, parseJoinLocation } from './joinUrl'
import {
  buildPeerJsClientOptions,
  listPeerJsBrokers,
  resolvePeerJsBrokerIndex,
} from './peerJsBrokers'
import { offerFingerprint } from './sdpUtils'

/** Thrown when guestFetchOffer discovers a multi-guest room — retry with joinRoomAsGuest. */
export class MultiGuestRoomError extends Error {
  constructor() {
    super('Multi-guest room')
    this.name = 'MultiGuestRoomError'
  }
}

export type SignalingAdapterName = 'peerjs' | 'firebase' | 'broadcast' | 'manual'

export interface SignalingRoomMeta {
  mode: SessionMode
  hostName?: string
  maxPlayers?: 2 | 3 | 4 | 5
  multiGuest?: boolean
  /** PeerJS broker index — host and guest must match for cross-device join. */
  peerJsBrokerIndex?: number
  /** Same-browser only — broadcast/localStorage signaling, not cross-device. */
  localOnly?: boolean
}

export interface SignalingAdapter {
  readonly name: SignalingAdapterName
  hostRoom(offer: string, meta: SignalingRoomMeta): Promise<{ code: string; joinUrl: string }>
  guestPublishAnswer(code: string, answer: string, guestId?: string, offerFp?: string): Promise<void>
  waitForAnswer(code: string, timeoutMs?: number, guestId?: string, offerFp?: string): Promise<string>
  guestFetchOffer(code: string, timeoutMs?: number, guestId?: string): Promise<string>
  joinRoomAsGuest?(code: string, guestId: string, timeoutMs?: number, stablePeerId?: string): Promise<string>
  publishGuestOffer?(code: string, guestId: string, offer: string): Promise<void>
  onGuestJoin?(handler: (signalingId: string, stablePeerId?: string) => void): () => void
  republishOffer?(code: string, offer: string): Promise<void>
  clearAnswer?(code: string, guestId?: string): void
  /** Clear stale localStorage guest SDP slots without tearing down live PeerJS connections. */
  clearGuestStorage?(code: string, guestId: string): void
  clearGuestSlot?(code: string, guestId: string): void
  sendSessionMessage?(data: unknown): void
  sendGuestSessionMessage?(guestId: string, data: unknown): void
  onSessionMessage?(handler: (data: unknown) => void): () => void
  onGuestSessionMessage?(handler: (guestId: string | undefined, data: unknown) => void): () => void
  close(opts?: { rejectPending?: boolean }): void
}
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
  offerFp?: string
  answer?: string
  answerFp?: string
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

function clearGuestSlot(code: string, guestId: string) {
  const prev = readRoom(code)
  if (!prev?.guests?.[guestId]) return
  const guests = { ...prev.guests }
  delete guests[guestId]
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

  const { multiGuest, maxPlayers, peerJsBrokerIndex } = parseJoinLocation(search, '')
  if (multiGuest && (mode === 'local' || mode === 'remote')) {
    return { mode, multiGuest: true, maxPlayers: maxPlayers ?? 2, peerJsBrokerIndex }
  }
  if (peerJsBrokerIndex !== undefined) {
    return { mode, peerJsBrokerIndex }
  }
  return null
}

function joinUrlFromMeta(code: string, meta: SignalingRoomMeta) {
  return buildJoinUrl(code, meta.mode, {
    multiGuest: meta.multiGuest,
    maxPlayers: meta.maxPlayers,
    peerJsBrokerIndex: meta.peerJsBrokerIndex,
  })
}

function readPairedAnswer(code: string, offerFp?: string): string | null {
  const rec = readRoom(code)
  if (!rec?.answer) return null
  if (offerFp && rec.answerFp && rec.answerFp !== offerFp) return null
  return rec.answer
}

function waitForRoomField(
  code: string,
  field: 'offer' | 'answer',
  timeoutMs: number,
  offerFp?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let bc: BroadcastChannel | null = null

    const check = () => {
      const rec = readRoom(code)
      if (field === 'answer') {
        const paired = readPairedAnswer(code, offerFp)
        if (paired) {
          cleanup()
          resolve(paired)
          return
        }
      } else {
        const value = rec?.[field]
        if (value) {
          cleanup()
          resolve(value)
          return
        }
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

function readPeerJsConfig(brokerIndex = 0) {
  return buildPeerJsClientOptions(brokerIndex)
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
  private guestJoinHandlers = new Set<(signalingId: string, stablePeerId?: string) => void>()
  private pendingGuestJoins = new Map<string, string | undefined>()
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

  private notifyGuestJoin(signalingId: string, stablePeerId?: string) {
    if (this.guestJoinHandlers.size === 0) {
      this.pendingGuestJoins.set(signalingId, stablePeerId)
      return
    }
    for (const h of this.guestJoinHandlers) h(signalingId, stablePeerId)
  }

  onGuestJoin(handler: (signalingId: string, stablePeerId?: string) => void) {
    this.guestJoinHandlers.add(handler)
    for (const [guestId, stablePeerId] of this.pendingGuestJoins) handler(guestId, stablePeerId)
    this.pendingGuestJoins.clear()
    return () => this.guestJoinHandlers.delete(handler)
  }

  async hostRoom(offer: string, meta: SignalingRoomMeta) {
    const code = generateRoomCode(4)
    this.codes.push(code)
    const offerFp = offerFingerprint(offer)
    writeRoom(code, { offer, offerFp, meta, answer: undefined, answerFp: undefined, guests: {} })
    return { code, joinUrl: joinUrlFromMeta(code, meta) }
  }

  /** Mirror an online-hosted room for same-browser guests (localStorage backup). */
  syncRoom(code: string, offer: string, meta: SignalingRoomMeta) {
    if (!this.codes.includes(code)) this.codes.push(code)
    const offerFp = offerFingerprint(offer)
    writeRoom(code, { offer, offerFp, meta, answer: undefined, answerFp: undefined, guests: {} })
  }

  async guestPublishAnswer(code: string, answer: string, guestId?: string, offerFp?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer })
      return
    }
    writeRoom(code, { answer, answerFp: offerFp })
  }

  async waitForAnswer(code: string, timeoutMs = 120_000, guestId?: string, offerFp?: string) {
    if (guestId) return waitForGuestField(code, guestId, 'answer', timeoutMs)
    const existing = readPairedAnswer(code, offerFp)
    if (existing) return existing
    return waitForRoomField(code, 'answer', timeoutMs, offerFp)
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
    const offerFp = offerFingerprint(offer)
    writeRoom(code, { offer, offerFp, answer: undefined, answerFp: undefined })
  }

  clearAnswer(code: string, guestId?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer: undefined })
      return
    }
    writeRoom(code, { answer: undefined, answerFp: undefined })
  }

  clearGuestSlot(code: string, guestId: string) {
    clearGuestSlot(code, guestId)
  }

  clearGuestStorage(code: string, guestId: string) {
    clearGuestSlot(code, guestId)
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
  private brokerIndex = 0
  private disconnecting = false
  private sessionHandlers = new Set<(data: unknown) => void>()
  private guestSessionHandlers = new Set<
    (guestId: string | undefined, data: unknown) => void
  >()
  private latestOffer: string | null = null
  private latestOfferFp: string | null = null
  private latestMeta: SignalingRoomMeta | null = null
  private conns = new Map<string, DataConn>()
  private guestJoinHandlers = new Set<(signalingId: string, stablePeerId?: string) => void>()
  private guestAnswerWaits = new Map<string, { resolve: (a: string) => void; reject: (e: Error) => void }>()
  private pendingGuestJoins = new Map<string, string | undefined>()
  private notifiedJoins = new Set<string>()

  get activeBrokerIndex(): number {
    return this.brokerIndex
  }

  private brokerIndicesToTry(hint?: number): number[] {
    const brokers = listPeerJsBrokers()
    if (hint !== undefined && hint >= 0 && hint < brokers.length) {
      const rest = brokers.map((_, i) => i).filter((i) => i !== hint)
      return [hint, ...rest]
    }
    return brokers.map((_, i) => i)
  }

  private async openPeer(id: string | undefined, brokerIndex: number): Promise<PeerInstance> {
    const Peer = await this.loadPeer()
    const cfg = readPeerJsConfig(brokerIndex)
    this.brokerIndex = brokerIndex
    const peer = id ? new Peer(id, cfg) : new Peer(cfg)
    this.peer = peer
    this.attachPeerLifecycle(peer)
    await waitPeerOpen(peer, 15_000)
    return peer
  }

  private notifyGuestJoin(signalingId: string, stablePeerId?: string) {
    if (this.notifiedJoins.has(signalingId)) return
    this.notifiedJoins.add(signalingId)
    if (this.guestJoinHandlers.size === 0) {
      this.pendingGuestJoins.set(signalingId, stablePeerId)
      return
    }
    for (const h of this.guestJoinHandlers) h(signalingId, stablePeerId)
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
      const offerFp = (msg as { offerFp?: string }).offerFp
      if (offerFp && this.latestOfferFp && offerFp !== this.latestOfferFp) return
      writeRoom(code, { answer: msg.answer, answerFp: offerFp })
      this.deliverAnswer(msg.answer, offerFp)
      return
    }
    if (msg.type === 'ice-reoffer' && msg.sdp) {
      this.emitSessionMessage(msg)
      this.emitGuestSessionMessage(guestId, msg)
      return
    }
    if (msg.type === 'ice-reanswer' && msg.sdp) {
      this.emitSessionMessage(msg)
      this.emitGuestSessionMessage(guestId, msg)
      return
    }
    if (msg.type === 'offer' && msg.offer) {
      this.emitSessionMessage(msg)
    }
  }

  private emitSessionMessage(data: unknown) {
    for (const handler of this.sessionHandlers) handler(data)
  }

  private emitGuestSessionMessage(guestId: string | undefined, data: unknown) {
    for (const handler of this.guestSessionHandlers) handler(guestId, data)
  }

  sendSessionMessage(data: unknown) {
    if (!this.conn?.open) return
    this.conn.send(data)
  }

  sendGuestSessionMessage(guestId: string, data: unknown) {
    const conn = this.conns.get(guestId)
    if (!conn?.open) return
    conn.send({ ...(data as object), guestId })
  }

  onSessionMessage(handler: (data: unknown) => void) {
    this.sessionHandlers.add(handler)
    return () => this.sessionHandlers.delete(handler)
  }

  onGuestSessionMessage(handler: (guestId: string | undefined, data: unknown) => void) {
    this.guestSessionHandlers.add(handler)
    return () => this.guestSessionHandlers.delete(handler)
  }

  onGuestJoin(handler: (signalingId: string, stablePeerId?: string) => void) {
    this.guestJoinHandlers.add(handler)
    for (const [guestId, stablePeerId] of this.pendingGuestJoins) handler(guestId, stablePeerId)
    this.pendingGuestJoins.clear()
    return () => this.guestJoinHandlers.delete(handler)
  }

  async publishGuestOffer(code: string, guestId: string, offer: string) {
    writeGuestSlot(code, guestId, { offer, answer: undefined })
    const deadline = Date.now() + 12_000
    let conn = this.conns.get(guestId)
    while (!conn && Date.now() < deadline) {
      await new Promise((r) => window.setTimeout(r, 50))
      conn = this.conns.get(guestId)
    }
    if (!conn) throw new Error('Guest signaling channel not ready')
    await waitConnOpen(conn, 12_000)
    conn.send({ type: 'webrtc-offer', guestId, offer })
  }

  private async joinRoomAsGuestOnBroker(
    normalized: string,
    guestId: string,
    timeoutMs: number,
    brokerIndex: number,
    stablePeerId?: string,
  ): Promise<string> {
    const peer = await this.openPeer(undefined, brokerIndex)
    const conn = peer.connect(`rg-${normalized}`, { reliable: true })
    this.conn = conn
    this.conns.set(guestId, conn)

    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('PeerJS guest offer timeout')), timeoutMs)
      let roomMultiGuest = false
      let offerResolved = false
      const onData = (data: unknown) => {
        const msg = data as {
          type?: string
          offer?: string
          guestId?: string
          meta?: SignalingRoomMeta
        }
        if (msg.type === 'room-meta' && msg.meta) {
          writeRoom(normalized, { meta: msg.meta })
          roomMultiGuest = Boolean(msg.meta.multiGuest)
          return
        }
        if (msg.type === 'webrtc-offer' && msg.offer && msg.guestId === guestId) {
          if (!offerResolved) {
            offerResolved = true
            window.clearTimeout(timer)
            resolve(msg.offer)
          }
          return
        }
        if (msg.type === 'offer' && msg.offer && !roomMultiGuest) {
          if (!offerResolved) {
            offerResolved = true
            window.clearTimeout(timer)
            resolve(msg.offer)
          }
          return
        }
        this.handleConnData(data, normalized, guestId)
      }
      conn.on('data', onData)
      void waitConnOpen(conn, 12_000)
        .then(() =>
          conn.send(
            stablePeerId
              ? { type: 'join-request', guestId, peerId: stablePeerId }
              : { type: 'join-request', guestId },
          ),
        )
        .catch(() => {
          window.clearTimeout(timer)
          reject(new Error('PeerJS guest connection failed'))
        })
    })
  }

  async joinRoomAsGuest(
    code: string,
    guestId: string,
    timeoutMs = 45_000,
    stablePeerId?: string,
  ) {
    const normalized = code.trim().toUpperCase()
    const localMeta = readRoom(normalized)?.meta
    const urlParams =
      typeof window !== 'undefined' ? parseJoinLocation(window.location.search, '') : null
    const hint = resolvePeerJsBrokerIndex(
      localMeta?.peerJsBrokerIndex,
      urlParams?.peerJsBrokerIndex ?? null,
    )

    let lastErr: Error | null = null
    for (const brokerIndex of this.brokerIndicesToTry(hint)) {
      try {
        return await this.joinRoomAsGuestOnBroker(
          normalized,
          guestId,
          timeoutMs,
          brokerIndex,
          stablePeerId,
        )
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error('PeerJS guest connection failed')
        this.close({ rejectPending: true })
      }
    }
    throw lastErr ?? new Error('PeerJS guest join timeout')
  }

  private deliverAnswer(answer: string, offerFp?: string) {
    if (offerFp && this.latestOfferFp && offerFp !== this.latestOfferFp) return
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
    const brokerIndex = meta.peerJsBrokerIndex ?? 0
    const code = generateRoomCode(4)
    const roomMeta: SignalingRoomMeta = { ...meta, peerJsBrokerIndex: brokerIndex }
    const peer = await this.openPeer(`rg-${code}`, brokerIndex)
    this.hostCode = code
    this.latestOffer = offer
    this.latestOfferFp = offerFingerprint(offer)
    this.latestMeta = roomMeta

    writeRoom(code, {
      offer,
      offerFp: this.latestOfferFp,
      meta: roomMeta,
      answer: undefined,
      answerFp: undefined,
      guests: {},
    })

    peer.on('connection', (conn) => {
      const multi = Boolean(meta.multiGuest)
      if (!multi) this.conn = conn
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
        const msg = data as { type?: string; guestId?: string; peerId?: string }
        if (msg.type === 'join-request' && msg.guestId) {
          boundGuestId = msg.guestId
          this.conns.set(msg.guestId, conn)
          this.notifyGuestJoin(msg.guestId, msg.peerId)
        } else if (msg.type === 'guest-ready') {
          if (meta.multiGuest) {
            const guestId =
              msg.guestId ??
              boundGuestId ??
              `guest-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
            boundGuestId = guestId
            this.conns.set(guestId, conn)
            this.notifyGuestJoin(guestId, msg.peerId)
          } else if (this.latestOffer) {
            conn.send({
              type: 'offer',
              offer: this.latestOffer,
              meta: this.latestMeta ?? meta,
            })
          }
        }
        this.handleConnData(data, code, boundGuestId ?? msg.guestId)
      })
      conn.on('close', () => {
        if (boundGuestId) {
          this.conns.delete(boundGuestId)
          this.notifiedJoins.delete(boundGuestId)
        }
      })
    })

    return { code, joinUrl: joinUrlFromMeta(code, roomMeta) }
  }

  private async guestFetchOfferOnBroker(
    normalized: string,
    timeoutMs: number,
    guestId: string | undefined,
    brokerIndex: number,
  ): Promise<string> {
    const peer = await this.openPeer(undefined, brokerIndex)
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
          if (msg.meta.multiGuest) {
            window.clearTimeout(timer)
            reject(new MultiGuestRoomError())
            return
          }
        }
        this.handleConnData(data, normalized)
      })
      void waitConnOpen(conn, 10_000)
        .then(() =>
          conn.send(guestId ? { type: 'guest-ready', guestId } : { type: 'guest-ready' }),
        )
        .catch(() => {
          window.clearTimeout(timer)
          reject(new Error('PeerJS guest connection failed — host may be offline'))
        })
    })
  }

  async guestFetchOffer(code: string, timeoutMs = 20_000, guestId?: string) {
    const normalized = code.trim().toUpperCase()
    const localMeta = readRoom(normalized)?.meta
    const urlParams =
      typeof window !== 'undefined' ? parseJoinLocation(window.location.search, '') : null
    const hint = resolvePeerJsBrokerIndex(
      localMeta?.peerJsBrokerIndex,
      urlParams?.peerJsBrokerIndex ?? null,
    )

    const localOffer = readRoom(normalized)?.offer
    if (localMeta?.localOnly && localOffer) return localOffer

    let lastErr: Error | null = null
    for (const brokerIndex of this.brokerIndicesToTry(hint)) {
      try {
        return await this.guestFetchOfferOnBroker(normalized, timeoutMs, guestId, brokerIndex)
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error('PeerJS guest connection failed')
        this.close({ rejectPending: true })
      }
    }
    throw lastErr ?? new Error('PeerJS offer timeout')
  }

  async guestPublishAnswer(code: string, answer: string, guestId?: string, offerFp?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer })
      const conn = this.conns.get(guestId) ?? this.conn
      if (!conn) throw new Error('PeerJS guest connection not open')
      await waitConnOpen(conn, 12_000)
      conn.send({ type: 'webrtc-answer', guestId, answer, offerFp })
      return
    }
    writeRoom(code, { answer, answerFp: offerFp })
    if (!this.conn?.open) throw new Error('PeerJS guest connection not open')
    this.conn.send({ type: 'answer', answer, offerFp })
  }

  async waitForAnswer(code: string, timeoutMs = 120_000, guestId?: string, offerFp?: string) {
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

    const existing = readPairedAnswer(code, offerFp ?? this.latestOfferFp ?? undefined)
    if (existing) return existing

    if (this.pendingAnswer) {
      const answer = this.pendingAnswer
      this.pendingAnswer = null
      return answer
    }
    const expectedFp = offerFp ?? this.latestOfferFp ?? undefined
    return new Promise<string>((resolve, reject) => {
      this.answerResolve = (answer) => {
        const paired = readPairedAnswer(code, expectedFp)
        if (paired) resolve(paired)
        else resolve(answer)
      }
      this.answerReject = reject
      this.answerTimer = window.setTimeout(() => {
        if (this.answerReject === reject) {
          this.clearAnswerWait()
          reject(new Error('PeerJS answer timeout'))
        }
      }, timeoutMs)
    })
  }

  async republishOffer(code: string, offer: string) {
    this.latestOffer = offer
    this.latestOfferFp = offerFingerprint(offer)
    writeRoom(code, {
      offer,
      offerFp: this.latestOfferFp,
      answer: undefined,
      answerFp: undefined,
    })
    this.pendingAnswer = null
    this.clearAnswerWait()
    if (this.conn?.open) {
      this.conn.send({ type: 'offer', offer, meta: this.latestMeta, offerFp: this.latestOfferFp })
    }
  }

  clearAnswer(code: string, guestId?: string) {
    if (guestId) {
      writeGuestSlot(code, guestId, { answer: undefined })
      return
    }
    writeRoom(code, { answer: undefined, answerFp: undefined })
    this.pendingAnswer = null
    this.clearAnswerWait()
  }

  clearGuestSlot(code: string, guestId: string) {
    clearGuestSlot(code, guestId)
    this.conns.delete(guestId)
    this.notifiedJoins.delete(guestId)
    this.guestAnswerWaits.delete(guestId)
  }

  clearGuestStorage(code: string, guestId: string) {
    clearGuestSlot(code, guestId)
    this.guestAnswerWaits.delete(guestId)
  }

  close(opts?: { rejectPending?: boolean }) {
    this.disconnecting = true
    if (opts?.rejectPending) {
      this.answerReject?.(new Error('PeerJS closed'))
    }
    this.clearAnswerWait()
    this.pendingAnswer = null
    this.sessionHandlers.clear()
    this.guestSessionHandlers.clear()
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
  private peerAdapter: PeerJSSignalingAdapter
  private broadcastAdapter: BroadcastSignalingAdapter
  private firebaseAdapter: FirebaseSignalingAdapter | null = null
  lastAdapter: SignalingAdapterName = 'peerjs'
  lastError: string | null = null

  constructor() {
    this.peerAdapter = new PeerJSSignalingAdapter()
    this.broadcastAdapter = new BroadcastSignalingAdapter()
    this.adapters.push(this.peerAdapter)
    this.adapters.push(this.broadcastAdapter)

    const firebase = new FirebaseSignalingAdapter()
    if (import.meta.env.VITE_FIREBASE_DATABASE_URL && import.meta.env.VITE_FIREBASE_API_KEY) {
      this.firebaseAdapter = firebase
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
    const brokers = listPeerJsBrokers()
    let lastErr: string | null = null

    for (let brokerIndex = 0; brokerIndex < brokers.length; brokerIndex++) {
      try {
        const roomMeta: SignalingRoomMeta = { ...meta, peerJsBrokerIndex: brokerIndex }
        const result = await this.raceAdapter(
          this.peerAdapter,
          () => this.peerAdapter.hostRoom(offer, roomMeta),
          ADAPTER_TIMEOUT_MS.peerjs,
        )
        this.active = this.peerAdapter
        this.lastAdapter = 'peerjs'
        this.lastError = null
        this.broadcastAdapter.syncRoom(result.code, offer, roomMeta)
        return result
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'PeerJS signaling failed'
        this.peerAdapter.close()
      }
    }

    if (this.firebaseAdapter) {
      try {
        const result = await this.raceAdapter(
          this.firebaseAdapter,
          () => this.firebaseAdapter!.hostRoom(offer, meta),
          ADAPTER_TIMEOUT_MS.firebase,
        )
        this.active = this.firebaseAdapter
        this.lastAdapter = 'firebase'
        this.lastError = null
        this.broadcastAdapter.syncRoom(result.code, offer, meta)
        return result
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'Firebase signaling failed'
        this.firebaseAdapter.close()
      }
    }

    try {
      const localMeta: SignalingRoomMeta = { ...meta, localOnly: true }
      const result = await this.raceAdapter(
        this.broadcastAdapter,
        () => this.broadcastAdapter.hostRoom(offer, localMeta),
        ADAPTER_TIMEOUT_MS.broadcast,
      )
      this.active = this.broadcastAdapter
      this.lastAdapter = 'broadcast'
      this.lastError =
        'Online signaling unavailable — room code works in this browser only (open a second tab to test)'
      return result
    } catch (err) {
      lastErr = err instanceof Error ? err.message : 'signaling failed'
      this.broadcastAdapter.close()
    }

    this.lastAdapter = 'manual'
    this.lastError = lastErr
    throw new Error('All signaling adapters failed — use manual SDP paste')
  }

  async guestFetchOffer(code: string, timeoutMs?: number, guestId?: string) {
    const normalized = code.trim().toUpperCase()
    const localMeta = readRoom(normalized)?.meta

    if (localMeta?.localOnly) {
      try {
        const offer = await this.broadcastAdapter.guestFetchOffer(code, timeoutMs, guestId)
        this.active = this.broadcastAdapter
        this.lastAdapter = 'broadcast'
        return offer
      } catch {
        this.broadcastAdapter.close()
      }
    }

    try {
      const offer = await this.peerAdapter.guestFetchOffer(code, timeoutMs, guestId)
      this.active = this.peerAdapter
      this.lastAdapter = 'peerjs'
      return offer
    } catch {
      this.peerAdapter.close()
    }

    if (this.firebaseAdapter) {
      try {
        const offer = await this.firebaseAdapter.guestFetchOffer(code, timeoutMs, guestId)
        this.active = this.firebaseAdapter
        this.lastAdapter = 'firebase'
        return offer
      } catch {
        this.firebaseAdapter.close()
      }
    }

    try {
      const offer = await this.broadcastAdapter.guestFetchOffer(code, timeoutMs, guestId)
      this.active = this.broadcastAdapter
      this.lastAdapter = 'broadcast'
      return offer
    } catch {
      this.broadcastAdapter.close()
    }

    this.lastAdapter = 'manual'
    throw new Error('Could not fetch offer — try manual SDP paste')
  }

  async guestPublishAnswer(code: string, answer: string, guestId?: string, offerFp?: string) {
    if (this.active) {
      await this.active.guestPublishAnswer(code, answer, guestId, offerFp)
      return
    }
    for (const adapter of this.adapters) {
      try {
        await adapter.guestPublishAnswer(code, answer, guestId, offerFp)
        this.active = adapter
        return
      } catch {
        adapter.close()
      }
    }
  }

  async joinRoomAsGuest(code: string, guestId: string, stablePeerId?: string) {
    const normalized = code.trim().toUpperCase()
    const localMeta = readRoom(normalized)?.meta

    if (localMeta?.localOnly) {
      try {
        const offer = await this.broadcastAdapter.joinRoomAsGuest!(code, guestId)
        this.active = this.broadcastAdapter
        this.lastAdapter = 'broadcast'
        return offer
      } catch {
        this.broadcastAdapter.close()
      }
    }

    try {
      const offer = await this.peerAdapter.joinRoomAsGuest!(code, guestId, undefined, stablePeerId)
      this.active = this.peerAdapter
      this.lastAdapter = 'peerjs'
      return offer
    } catch {
      this.peerAdapter.close()
    }

    try {
      const offer = await this.broadcastAdapter.joinRoomAsGuest!(code, guestId)
      this.active = this.broadcastAdapter
      this.lastAdapter = 'broadcast'
      return offer
    } catch {
      this.broadcastAdapter.close()
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

  onGuestJoin(handler: (signalingId: string, stablePeerId?: string) => void) {
    const unsubs: Array<() => void> = []
    for (const adapter of this.adapters) {
      const unsub = adapter.onGuestJoin?.(handler)
      if (unsub) unsubs.push(unsub)
    }
    return () => {
      for (const u of unsubs) u()
    }
  }

  sendSessionMessage(data: unknown) {
    this.active?.sendSessionMessage?.(data)
  }

  sendGuestSessionMessage(guestId: string, data: unknown) {
    this.peerAdapter.sendGuestSessionMessage(guestId, data)
  }

  onSessionMessage(handler: (data: unknown) => void) {
    const unsubs = this.adapters
      .map((adapter) => adapter.onSessionMessage?.(handler))
      .filter(Boolean) as Array<() => void>
    return () => {
      for (const unsub of unsubs) unsub()
    }
  }

  onGuestSessionMessage(handler: (guestId: string | undefined, data: unknown) => void) {
    return this.peerAdapter.onGuestSessionMessage(handler)
  }

  async waitForAnswer(code: string, guestId?: string, offerFp?: string) {
    if (this.active) {
      return this.active.waitForAnswer(code, 120_000, guestId, offerFp)
    }

    for (const adapter of this.adapters) {
      try {
        return await adapter.waitForAnswer(code, 120_000, guestId, offerFp)
      } catch {
        adapter.close()
      }
    }
    throw new Error('Answer timeout')
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

  clearGuestSlot(code: string, guestId: string) {
    this.active?.clearGuestSlot?.(code, guestId)
    this.broadcastAdapter.clearGuestSlot?.(code, guestId)
    this.peerAdapter.clearGuestSlot?.(code, guestId)
  }

  clearGuestStorage(code: string, guestId: string) {
    this.active?.clearGuestStorage?.(code, guestId)
    this.broadcastAdapter.clearGuestStorage?.(code, guestId)
    this.peerAdapter.clearGuestStorage?.(code, guestId)
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
      return 'Room code (same browser only)'
    case 'manual':
      return 'Manual SDP paste'
  }
}
