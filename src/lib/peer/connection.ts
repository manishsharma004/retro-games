import { compressSignal, decompressSignal } from './compress'
import {
  getIceConfig,
  ICE_CONNECT_TIMEOUT_MS,
  ICE_REMOTE_CONNECT_TIMEOUT_MS,
  ICE_REMOTE_LOCAL_RETRY_MS,
  ICE_LOCAL_RETRY_MS,
  type ConnectionPath,
  type IceTier,
} from './connectivity'
import {
  CHUNK_PAYLOAD_SIZE,
  decodeChunk,
  encodeChunk,
  isControlMessage,
  type ControlMessage,
} from './protocol'

export interface PeerConnectionOptions {
  /** @deprecated use iceTier — relay tier forces TURN from the start */
  preferTurn?: boolean
  iceTier?: IceTier
  /** Remote play session — try LAN/STUN first, then TURN fallback (works same-phone multi-browser). */
  remotePlay?: boolean
  /** Force TURN relay candidates only (last-resort ICE restart). */
  forceRelay?: boolean
  /** Pre-declare sendonly A/V m-lines so cross-browser answers match (remote stream). */
  declareSendonlyMedia?: boolean
}

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
  /** Host needs to push an ICE-restart offer (local→relay fallback or LAN migration). */
  onRenegotiationOffer?: (signal: string, tier: IceTier) => void
  /** ICE tier changed (local STUN-only vs relay fallback). */
  onIceTierChange?: (tier: IceTier) => void
  /** Active transport path once ICE selects a candidate pair. */
  onConnectionPath?: (path: ConnectionPath) => void
  /** Remote mode: incoming media stream from peer. */
  onRemoteStream?: (stream: MediaStream) => void
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
  private iceTier: IceTier = 'local'
  private relayRetries = 0
  private localMigrateAttempted = false
  private localMigrateTimer: number | null = null
  private connectionPath: ConnectionPath = 'unknown'
  private declareSendonlyMedia: boolean
  private readonly remotePlay: boolean
  private relayOnlyMode = false
  /** Senders created via prepareSendonlyMedia before tracks exist. */
  private sendonlySenderKinds = new Map<RTCRtpSender, MediaStreamTrack['kind']>()

  constructor(handlers: PeerConnectionHandlers = {}, options: PeerConnectionOptions = {}) {
    this.handlers = handlers
    this.remotePlay = options.remotePlay ?? false
    this.declareSendonlyMedia = options.declareSendonlyMedia ?? false
    this.iceTier = options.iceTier ?? (options.preferTurn ? 'relay' : 'local')
  }

  private connectWatchMs(): number {
    if (this.relayOnlyMode || this.iceTier === 'relay') return ICE_REMOTE_CONNECT_TIMEOUT_MS
    if (this.remotePlay) return ICE_REMOTE_LOCAL_RETRY_MS
    return ICE_LOCAL_RETRY_MS
  }

  private maxRelayRetries(): number {
    return this.remotePlay ? 3 : 1
  }

  private restoreIceSessionDefaults() {
    this.iceTier = 'local'
    this.relayOnlyMode = false
    this.relayRetries = 0
    this.localMigrateAttempted = false
    this.connectionPath = 'unknown'
  }

  get activeIceTier(): IceTier {
    return this.iceTier
  }

  get activeConnectionPath(): ConnectionPath {
    return this.connectionPath
  }

  private setConnectionPath(path: ConnectionPath) {
    if (this.connectionPath === path) return
    this.connectionPath = path
    this.handlers.onConnectionPath?.(path)
  }

  private clearLocalMigrateTimer() {
    if (this.localMigrateTimer !== null) {
      window.clearTimeout(this.localMigrateTimer)
      this.localMigrateTimer = null
    }
  }

  private scheduleLocalMigration() {
    if (this.relayOnlyMode || this.localMigrateAttempted || this.iceTier !== 'relay') return
    this.clearLocalMigrateTimer()
    this.localMigrateTimer = window.setTimeout(() => {
      this.localMigrateTimer = null
      void this.tryMigrateToLocal()
    }, 1500)
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
      if (this.state !== 'connecting' && this.state !== 'awaiting-answer') return
      if (!this.isAnswerer && this.relayRetries < this.maxRelayRetries()) {
        void this.tryRelayFallback()
        return
      }
      this.handlers.onError?.(
        new Error(
          'Connection timed out — try same Wi‑Fi/hotspot, enable TURN, or use manual SDP paste',
        ),
      )
      this.setState('failed')
    }, timeoutMs)
  }

  private async readSelectedCandidatePath(): Promise<ConnectionPath> {
    const pc = this.pc
    if (!pc) return 'unknown'
    try {
      const stats = await pc.getStats()
      let selected: { localCandidateId?: string } | undefined
      for (const report of stats.values()) {
        const r = report as { type?: string; selected?: boolean; selectedCandidatePairId?: string; localCandidateId?: string; candidateType?: string }
        if (r.type === 'transport' && r.selectedCandidatePairId) {
          const pair = stats.get(r.selectedCandidatePairId) as { type?: string; localCandidateId?: string } | undefined
          if (pair?.type === 'candidate-pair') selected = pair
        }
        if (r.type === 'candidate-pair' && r.selected) {
          selected = r
        }
      }
      if (!selected?.localCandidateId) return 'unknown'
      const local = stats.get(selected.localCandidateId) as { candidateType?: string } | undefined
      const type = local?.candidateType
      if (type === 'host') return 'local'
      if (type === 'srflx' || type === 'prflx') return 'stun'
      if (type === 'relay') return 'relay'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private async refreshConnectionPath() {
    const path = await this.readSelectedCandidatePath()
    if (path !== 'unknown') this.setConnectionPath(path)
  }

  private async tryRelayFallback(): Promise<void> {
    if (this.isAnswerer || this.relayRetries >= this.maxRelayRetries()) return
    this.relayOnlyMode = true
    this.relayRetries++
    if (this.iceTier !== 'relay') {
      this.iceTier = 'relay'
      this.handlers.onIceTierChange?.('relay')
    }
    try {
      const offer = await this.renegotiateAsOfferer('relay')
      this.handlers.onRenegotiationOffer?.(offer, 'relay')
      this.watchForConnect(this.connectWatchMs())
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error ? err : new Error('Could not upgrade to relay connection'),
      )
      if (this.relayRetries >= this.maxRelayRetries()) {
        this.setState('failed')
      }
    }
  }

  private async tryMigrateToLocal(): Promise<void> {
    if (this.localMigrateAttempted || this.isAnswerer || !this.pc) return
    const path = await this.readSelectedCandidatePath()
    if (path !== 'relay') return
    this.localMigrateAttempted = true
    this.iceTier = 'local'
    this.handlers.onIceTierChange?.('local')
    try {
      const offer = await this.renegotiateAsOfferer('local')
      this.handlers.onRenegotiationOffer?.(offer, 'local')
    } catch {
      this.iceTier = 'relay'
      this.handlers.onIceTierChange?.('relay')
      this.localMigrateAttempted = false
    }
  }

  private applyIceConfiguration(pc: RTCPeerConnection, tier: IceTier) {
    const { iceServers, iceTransportPolicy } = getIceConfig(tier, this.relayOnlyMode)
    pc.setConfiguration({
      iceServers,
      iceCandidatePoolSize: 10,
      ...(iceTransportPolicy ? { iceTransportPolicy } : {}),
    })
  }

  private async renegotiateAsOfferer(tier: IceTier): Promise<string> {
    const pc = this.pc
    if (!pc) throw new Error('No peer connection')
    this.applyIceConfiguration(pc, tier)
    pc.restartIce()
    const offer = await pc.createOffer({ iceRestart: true })
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc, this.relayOnlyMode ? 15_000 : 8000)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create ICE restart offer')
    return compressSignal(local.sdp)
  }

  async acceptRenegotiationOffer(encoded: string, tier: IceTier = 'relay'): Promise<string> {
    const pc = this.pc
    if (!pc) throw new Error('No peer connection')
    this.iceTier = tier
    if (tier === 'relay') this.relayOnlyMode = true
    this.handlers.onIceTierChange?.(tier)
    this.applyIceConfiguration(pc, tier)
    const sdp = decompressSignal(encoded)
    await pc.setRemoteDescription({ type: 'offer', sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create ICE restart answer')
    this.watchForConnect(ICE_CONNECT_TIMEOUT_MS)
    return compressSignal(local.sdp)
  }

  async acceptRenegotiationAnswer(encoded: string): Promise<void> {
    const pc = this.pc
    if (!pc) throw new Error('No peer connection')
    const sdp = decompressSignal(encoded)
    await pc.setRemoteDescription({ type: 'answer', sdp })
    this.watchForConnect(ICE_CONNECT_TIMEOUT_MS)
  }

  private teardownPc(keepOffer = false) {
    this.clearConnectWatch()
    this.clearLocalMigrateTimer()
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
    this.sendonlySenderKinds.clear()
    this.offererAnswerApplied = false
    if (!keepOffer) this.remoteOfferSdp = null
  }

  private ensurePc(): RTCPeerConnection {
    if (this.pc) return this.pc
    const { iceServers, iceTransportPolicy } = getIceConfig(this.iceTier, this.relayOnlyMode)
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      ...(iceTransportPolicy ? { iceTransportPolicy } : {}),
    })
    pc.ontrack = (event) => {
      const stream =
        event.streams[0] ??
        (event.track ? new MediaStream([event.track]) : undefined)
      if (stream) this.handlers.onRemoteStream?.(stream)
    }
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') {
        this.clearConnectWatch()
        void this.refreshConnectionPath()
        if (this.iceTier === 'relay') this.scheduleLocalMigration()
        if (this.channel?.readyState === 'open') this.setState('connected')
        else if (!SIGNALING_WAIT_STATES.has(this.state)) this.setState('connecting')
        return
      }
      if (SIGNALING_WAIT_STATES.has(this.state)) return

      if (s === 'failed') {
        if (!this.isAnswerer && this.relayRetries < this.maxRelayRetries()) {
          void this.tryRelayFallback()
          return
        }
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
        void this.refreshConnectionPath()
        if (this.channel?.readyState === 'open') {
          this.clearConnectWatch()
          this.setState('connected')
          if (this.iceTier === 'relay') this.scheduleLocalMigration()
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
      if (!this.isAnswerer && this.relayRetries < this.maxRelayRetries()) {
        void this.tryRelayFallback()
        return
      }
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
      void this.refreshConnectionPath()
      if (this.iceTier === 'relay') this.scheduleLocalMigration()
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

  private prepareSendonlyMedia(pc: RTCPeerConnection) {
    if (!this.declareSendonlyMedia) return
    for (const kind of ['video', 'audio'] as const) {
      const hasKind = pc.getTransceivers().some((t) => {
        const track = t.sender.track ?? t.receiver.track
        return track?.kind === kind
      })
      if (!hasKind) {
        const transceiver = pc.addTransceiver(kind, { direction: 'sendonly' })
        this.sendonlySenderKinds.set(transceiver.sender, kind)
      }
    }
  }

  private findSenderForTrack(
    pc: RTCPeerConnection,
    kind: MediaStreamTrack['kind'],
  ): { sender?: RTCRtpSender; wasPlaceholder: boolean } {
    const direct = pc.getSenders().find((s) => s.track?.kind === kind)
    if (direct) return { sender: direct, wasPlaceholder: false }

    for (const [sender, senderKind] of this.sendonlySenderKinds) {
      if (senderKind === kind && !sender.track) {
        return { sender, wasPlaceholder: true }
      }
    }

    return { wasPlaceholder: false }
  }

  async createOffer(): Promise<string> {
    this.clearLocalMigrateTimer()
    this.teardownPc(false)
    this.isAnswerer = false
    this.restoreIceSessionDefaults()
    this.offererAnswerApplied = false
    this.setState('creating-offer')
    const pc = this.ensurePc()
    this.prepareSendonlyMedia(pc)
    const channel = pc.createDataChannel('retro-games', { ordered: true })
    this.wireChannel(channel)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc, this.relayOnlyMode ? 15_000 : 8000)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create offer SDP')
    this.setState('awaiting-answer')
    return compressSignal(local.sdp)
  }

  async acceptAnswer(encoded: string): Promise<void> {
    const pc = this.pc
    if (!pc) throw new Error('Create an offer first')
    const sdp = decompressSignal(encoded)
    this.setState('connecting')
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp })
      this.offererAnswerApplied = true
    } catch (err) {
      this.offererAnswerApplied = false
      this.setState('awaiting-answer')
      throw err
    }
    this.watchForConnect(this.connectWatchMs())
  }

  /** Attach canvas/audio stream for remote mode (host side).
   * Returns true when SDP renegotiation is required after attaching tracks. */
  async addMediaStream(stream: MediaStream): Promise<boolean> {
    const pc = this.ensurePc()
    let addedTrack = false
    let attachedToPlaceholder = false
    for (const track of stream.getTracks()) {
      const { sender, wasPlaceholder } = this.findSenderForTrack(pc, track.kind)
      if (sender) {
        await sender.replaceTrack(track)
        if (wasPlaceholder) attachedToPlaceholder = true
      } else {
        pc.addTrack(track, stream)
        addedTrack = true
      }
    }
    return (
      (addedTrack || (this.declareSendonlyMedia && attachedToPlaceholder)) &&
      this.offererAnswerApplied &&
      (pc.connectionState === 'connected' || pc.signalingState === 'stable')
    )
  }

  /** Host: offer new SDP after attaching a video track post-connect. */
  async createMediaRenegotiationOffer(): Promise<string> {
    const pc = this.pc
    if (!pc) throw new Error('No peer connection')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create media renegotiation offer')
    return compressSignal(local.sdp)
  }

  /** Guest: answer a media renegotiation offer from the host. */
  async acceptMediaRenegotiationOffer(encoded: string): Promise<string> {
    const pc = this.pc
    if (!pc) throw new Error('No peer connection')
    const sdp = decompressSignal(encoded)
    await pc.setRemoteDescription({ type: 'offer', sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create media renegotiation answer')
    return compressSignal(local.sdp)
  }

  async acceptMediaRenegotiationAnswer(encoded: string): Promise<void> {
    const pc = this.pc
    if (!pc) throw new Error('No peer connection')
    const sdp = decompressSignal(encoded)
    await pc.setRemoteDescription({ type: 'answer', sdp })
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.pc
  }

  async createOfferWithMedia(stream?: MediaStream): Promise<string> {
    if (stream) await this.addMediaStream(stream)
    return this.createOffer()
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
    await waitForIceGathering(pc, this.relayOnlyMode ? 15_000 : 8000)
    const local = pc.localDescription
    if (!local?.sdp) throw new Error('Failed to create answer SDP')
    this.setState('awaiting-answer')
    // Guest ICE runs before host pastes — allow a long wait, with refresh on failure.
    this.watchForConnect(isRefresh ? 120000 : this.remotePlay ? ICE_REMOTE_CONNECT_TIMEOUT_MS : 180000)
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

  /** Tear down WebRTC only — handlers and signaling stay alive for reconnect. */
  softClose(): void {
    this.clearLocalMigrateTimer()
    this.teardownPc(false)
    this.isAnswerer = false
    this.restoreIceSessionDefaults()
    this.setState('idle')
  }

  /** ICE restart while keeping the same peer connection (host/offerer). */
  async createIceRestartOffer(): Promise<string> {
    return this.renegotiateAsOfferer(this.iceTier)
  }

  close(): void {
    this.clearLocalMigrateTimer()
    this.teardownPc(false)
    this.isAnswerer = false
    this.restoreIceSessionDefaults()
    this.setState('closed')
  }
}
