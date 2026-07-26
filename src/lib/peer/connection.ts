import { compressSignal, decompressSignal } from './compress'
import {
  CHUNK_PAYLOAD_SIZE,
  decodeChunk,
  encodeChunk,
  isControlMessage,
  type ControlMessage,
} from './protocol'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/** States where we are still exchanging SDP out-of-band — ICE must not kill the session. */
const SIGNALING_WAIT_STATES: ReadonlySet<PeerConnectionState> = new Set([
  'creating-offer',
  'awaiting-answer',
  'creating-answer',
])

export type PeerConnectionState =
  | 'idle'
  | 'creating-offer'
  | 'awaiting-answer'
  | 'creating-answer'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'

export interface PeerConnectionHandlers {
  onState?: (state: PeerConnectionState) => void
  onControl?: (msg: ControlMessage) => void
  onTransferProgress?: (info: {
    id: number
    kind: 'rom' | 'state'
    received: number
    total: number
  }) => void
  onTransferComplete?: (info: {
    id: number
    kind: 'rom' | 'state'
    data: Uint8Array
  }) => void
  onError?: (error: Error) => void
}

interface PendingTransfer {
  kind: 'rom' | 'state'
  size: number
  chunks: (Uint8Array | undefined)[]
  received: number
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      pc.removeEventListener('icegatheringstatechange', check)
      window.clearTimeout(timer)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    pc.addEventListener('icegatheringstatechange', check)
    // Safety timeout — use whatever candidates we have.
    const timer = window.setTimeout(finish, 2500)
  })
}

export class PeerConnection {
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private handlers: PeerConnectionHandlers
  private state: PeerConnectionState = 'idle'
  private nextTransferId = 1
  private pending = new Map<number, PendingTransfer>()
  private transferKinds = new Map<number, 'rom' | 'state'>()
  /** True after the offerer has applied the remote answer (both sides can finish ICE). */
  private offererAnswerApplied = false
  private connectWatchTimer: number | null = null

  constructor(handlers: PeerConnectionHandlers = {}) {
    this.handlers = handlers
  }

  get connectionState(): PeerConnectionState {
    return this.state
  }

  get connected(): boolean {
    return this.state === 'connected' && this.channel?.readyState === 'open'
  }

  private setState(next: PeerConnectionState) {
    if (this.state === next) return
    this.state = next
    this.handlers.onState?.(next)
  }

  private clearConnectWatch() {
    if (this.connectWatchTimer !== null) {
      window.clearTimeout(this.connectWatchTimer)
      this.connectWatchTimer = null
    }
  }

  private watchForConnect(timeoutMs: number) {
    this.clearConnectWatch()
    this.connectWatchTimer = window.setTimeout(() => {
      this.connectWatchTimer = null
      if (this.state === 'connecting' || this.state === 'awaiting-answer') {
        this.handlers.onError?.(
          new Error(
            'Connection timed out — start a new session, paste the answer sooner, or use the same Wi‑Fi',
          ),
        )
        this.setState('failed')
      }
    }, timeoutMs)
  }

  private ensurePc(): RTCPeerConnection {
    if (this.pc) return this.pc
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 8,
    })
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') {
        this.clearConnectWatch()
        this.setState('connected')
        return
      }
      // While waiting for paste of offer/answer, browsers may report connecting/failed
      // because ICE has no remote peer yet — ignore those so the host can still paste.
      if (SIGNALING_WAIT_STATES.has(this.state)) return

      if (s === 'failed') {
        // Guest may hit failed while host still pastes the answer; only fail the
        // offerer after answer is applied, or either side after a connect watch.
        if (this.offererAnswerApplied || this.state === 'connecting') {
          this.setState('failed')
        }
      } else if (s === 'disconnected') {
        if (this.state === 'connected') this.setState('disconnected')
      } else if (s === 'closed') {
        if (this.state !== 'closed') this.setState('closed')
      } else if (s === 'connecting') {
        if (this.state !== 'connected') this.setState('connecting')
      }
    }
    pc.oniceconnectionstatechange = () => {
      if (SIGNALING_WAIT_STATES.has(this.state)) return
      if (pc.iceConnectionState !== 'failed') return
      // Soft-fail only once we expected a live path (host applied answer).
      if (!this.offererAnswerApplied && this.state !== 'connecting') return
      if (this.state === 'connected') return
      this.handlers.onError?.(
        new Error('ICE connection failed — try same Wi‑Fi/hotspot and a fresh session'),
      )
      this.setState('failed')
    }
    this.pc = pc
    return pc
  }

  private wireChannel(channel: RTCDataChannel) {
    this.channel = channel
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => {
      this.clearConnectWatch()
      this.setState('connected')
    }
    channel.onclose = () => {
      if (this.state === 'connected' || this.state === 'connecting') {
        this.setState('disconnected')
      }
    }
    channel.onerror = () => {
      // Ignore DataChannel errors during paste wait — channel stays "connecting"
      // until the remote answer is applied.
      if (SIGNALING_WAIT_STATES.has(this.state)) return
      this.handlers.onError?.(new Error('DataChannel error'))
    }
    channel.onmessage = (event) => this.handleMessage(event.data)
  }

  private handleMessage(data: unknown) {
    if (typeof data === 'string') {
      try {
        const parsed: unknown = JSON.parse(data)
        if (!isControlMessage(parsed)) return
        if (parsed.type === 'transfer-start') {
          this.pending.set(parsed.id, {
            kind: parsed.kind,
            size: parsed.size,
            chunks: [],
            received: 0,
          })
          this.transferKinds.set(parsed.id, parsed.kind)
        } else if (parsed.type === 'transfer-end') {
          const pending = this.pending.get(parsed.id)
          if (pending) {
            const missing = pending.chunks.findIndex((c) => !c)
            if (missing !== -1) {
              this.handlers.onError?.(
                new Error(`Incomplete ${parsed.kind} transfer (missing chunk ${missing})`),
              )
            } else {
              const total = pending.chunks.reduce((n, c) => n + (c?.byteLength ?? 0), 0)
              const merged = new Uint8Array(total)
              let offset = 0
              for (const chunk of pending.chunks) {
                if (!chunk) continue
                merged.set(chunk, offset)
                offset += chunk.byteLength
              }
              this.handlers.onTransferComplete?.({
                id: parsed.id,
                kind: parsed.kind,
                data: merged,
              })
            }
            this.pending.delete(parsed.id)
          }
        }
        this.handlers.onControl?.(parsed)
      } catch (err) {
        this.handlers.onError?.(
          err instanceof Error ? err : new Error('Bad control message'),
        )
      }
      return
    }

    if (data instanceof ArrayBuffer) {
      const chunk = decodeChunk(data)
      if (!chunk) return
      let pending = this.pending.get(chunk.id)
      if (!pending) {
        const kind = this.transferKinds.get(chunk.id) ?? 'rom'
        pending = {
          kind,
          size: 0,
          chunks: Array.from({ length: chunk.count }),
          received: 0,
        }
        this.pending.set(chunk.id, pending)
      }
      if (!pending.chunks[chunk.index]) {
        pending.chunks[chunk.index] = chunk.payload
        pending.received += chunk.payload.byteLength
      }
      if (pending.chunks.length !== chunk.count) {
        pending.chunks = Array.from({ length: chunk.count }, (_, i) => pending!.chunks[i])
      }
      this.handlers.onTransferProgress?.({
        id: chunk.id,
        kind: pending.kind,
        received: pending.received,
        total: pending.size || chunk.count * CHUNK_PAYLOAD_SIZE,
      })
    }
  }

  async createOffer(): Promise<string> {
    this.close()
    this.offererAnswerApplied = false
    this.setState('creating-offer')
    const pc = this.ensurePc()
    const channel = pc.createDataChannel('retro-games', { ordered: true })
    this.wireChannel(channel)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create offer SDP')
    this.setState('awaiting-answer')
    return compressSignal(local.sdp)
  }

  async acceptAnswer(encoded: string): Promise<void> {
    const pc = this.pc
    if (!pc) throw new Error('Create an offer first')
    const sdp = decompressSignal(encoded)
    this.offererAnswerApplied = true
    this.setState('connecting')
    await pc.setRemoteDescription({ type: 'answer', sdp })
    // Both sides now have full SDP — expect DataChannel soon.
    this.watchForConnect(45000)
  }

  async createAnswerFromOffer(encoded: string): Promise<string> {
    this.close()
    this.offererAnswerApplied = false
    this.setState('creating-answer')
    const pc = this.ensurePc()
    pc.ondatachannel = (event) => this.wireChannel(event.channel)
    const sdp = decompressSignal(encoded)
    await pc.setRemoteDescription({ type: 'offer', sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create answer SDP')
    // Stay in creating-answer-adjacent wait: guest ICE may run before the host
    // pastes the answer. Use awaiting-answer semantics so premature ICE failure
    // does not wipe the UI — host applying the answer completes the handshake.
    this.setState('awaiting-answer')
    // Soft upper bound while waiting for host to accept (manual paste can be slow).
    this.watchForConnect(180000)
    return compressSignal(local.sdp)
  }

  sendControl(msg: ControlMessage): void {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('Peer channel is not open')
    }
    this.channel.send(JSON.stringify(msg))
  }

  async sendBlob(kind: 'rom' | 'state', data: Uint8Array): Promise<number> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('Peer channel is not open')
    }
    const id = this.nextTransferId++
    const count = Math.max(1, Math.ceil(data.byteLength / CHUNK_PAYLOAD_SIZE))
    this.sendControl({ type: 'transfer-start', id, kind, size: data.byteLength })
    for (let i = 0; i < count; i++) {
      const start = i * CHUNK_PAYLOAD_SIZE
      const end = Math.min(start + CHUNK_PAYLOAD_SIZE, data.byteLength)
      const payload = data.subarray(start, end)
      this.channel.send(encodeChunk(id, i, count, payload))
      // Yield so UI can paint and the browser can flush the socket buffer.
      if (i % 4 === 3) await new Promise<void>((r) => setTimeout(r, 0))
    }
    this.sendControl({ type: 'transfer-end', id, kind })
    return id
  }

  close(): void {
    this.clearConnectWatch()
    this.offererAnswerApplied = false
    try {
      this.channel?.close()
    } catch {
      // ignore
    }
    try {
      this.pc?.close()
    } catch {
      // ignore
    }
    this.channel = null
    this.pc = null
    this.pending.clear()
    this.transferKinds.clear()
    this.setState('closed')
  }
}
