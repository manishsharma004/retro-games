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
  /** Guest regenerated answer after ICE died while waiting for host — re-share this string. */
  onSignalRefresh?: (signal: string) => void
}

interface PendingTransfer {
  kind: 'rom' | 'state'
  size: number
  chunks: (Uint8Array | undefined)[]
  received: number
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 8000): Promise<void> {
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
    const timer = window.setTimeout(finish, timeoutMs)
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
  /** Raw remote offer SDP — used to refresh a guest answer if ICE dies while waiting. */
  private remoteOfferSdp: string | null = null
  private refreshingAnswer = false
  private isAnswerer = false

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
            'Connection timed out — start a new session on both devices (same Wi‑Fi/hotspot), and paste the latest answer',
          ),
        )
        this.setState('failed')
      }
    }, timeoutMs)
  }

  private teardownPc(keepOffer = false) {
    this.clearConnectWatch()
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
    this.offererAnswerApplied = false
    if (!keepOffer) this.remoteOfferSdp = null
  }

  private ensurePc(): RTCPeerConnection {
    if (this.pc) return this.pc
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    })
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') {
        this.clearConnectWatch()
        // Prefer DataChannel onopen as the source of truth; still mark connected here.
        if (this.channel?.readyState === 'open') this.setState('connected')
        else if (!SIGNALING_WAIT_STATES.has(this.state)) this.setState('connecting')
        return
      }
      if (SIGNALING_WAIT_STATES.has(this.state)) return

      if (s === 'failed') {
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
      const ice = pc.iceConnectionState
      if (ice === 'connected' || ice === 'completed') {
        if (this.channel?.readyState === 'open') {
          this.clearConnectWatch()
          this.setState('connected')
        }
        return
      }
      if (ice !== 'failed' && ice !== 'disconnected') return

      // Guest waiting for host to paste answer: ICE often dies — refresh answer.
      if (
        this.isAnswerer &&
        SIGNALING_WAIT_STATES.has(this.state) &&
        this.remoteOfferSdp &&
        !this.offererAnswerApplied &&
        !this.refreshingAnswer
      ) {
        void this.refreshAnswerAfterIceFailure()
        return
      }

      if (SIGNALING_WAIT_STATES.has(this.state)) return
      if (!this.offererAnswerApplied && this.state !== 'connecting') return
      if (this.state === 'connected') return
      this.handlers.onError?.(
        new Error('ICE connection failed — use the same Wi‑Fi/hotspot and start a fresh session'),
      )
      this.setState('failed')
    }
    this.pc = pc
    return pc
  }

  private async refreshAnswerAfterIceFailure() {
    if (!this.remoteOfferSdp || this.refreshingAnswer) return
    this.refreshingAnswer = true
    try {
      const signal = await this.buildAnswerFromRemoteOffer(this.remoteOfferSdp, true)
      this.handlers.onSignalRefresh?.(signal)
      this.handlers.onError?.(
        new Error('Link timed out while waiting — a fresh answer was generated. Send it to the host again.'),
      )
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error ? err : new Error('Could not refresh answer after ICE failure'),
      )
      this.setState('failed')
    } finally {
      this.refreshingAnswer = false
    }
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
    this.isAnswerer = false
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
    this.watchForConnect(60000)
  }

  async createAnswerFromOffer(encoded: string): Promise<string> {
    const sdp = decompressSignal(encoded)
    this.remoteOfferSdp = sdp
    this.isAnswerer = true
    return this.buildAnswerFromRemoteOffer(sdp, false)
  }

  private async buildAnswerFromRemoteOffer(sdp: string, isRefresh: boolean): Promise<string> {
    this.teardownPc(true)
    this.offererAnswerApplied = false
    this.isAnswerer = true
    this.setState('creating-answer')
    const pc = this.ensurePc()
    pc.ondatachannel = (event) => this.wireChannel(event.channel)
    await pc.setRemoteDescription({ type: 'offer', sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create answer SDP')
    this.setState('awaiting-answer')
    // Guest ICE runs before host pastes — allow a long wait, with refresh on failure.
    this.watchForConnect(isRefresh ? 120000 : 180000)
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
      if (i % 4 === 3) await new Promise<void>((r) => setTimeout(r, 0))
    }
    this.sendControl({ type: 'transfer-end', id, kind })
    return id
  }

  close(): void {
    this.teardownPc(false)
    this.isAnswerer = false
    this.setState('closed')
  }
}
