import { PeerConnection, type PeerConnectionHandlers, type PeerConnectionState } from './connection'
import type { ControlMessage, PeerSeat, RosterPeer } from './protocol'
import type { MaxPlayers, RosterConnectionStatus, RosterEntry } from './roster'
import { isSeatTaken } from './roster'
import type { SignalingAdapterChain } from './signaling'

export interface GuestLink {
  signalingId: string
  peerId: string
  seat: PeerSeat | null
  connection: PeerConnection
  connectionState: PeerConnectionState
}

export interface MultiPeerHostHandlers {
  onRemoteInput: (seat: PeerSeat, button: string, down: boolean, executeAt?: number) => void
  onRosterChange: (roster: RosterEntry[], guests: GuestLink[]) => void
  onGuestConnected?: (peerId: string) => void
  onGuestControl?: (peerId: string, msg: ControlMessage) => void
  onGuestDisconnected?: (peerId: string) => void
  onError?: (message: string) => void
}

export class MultiPeerHostManager {
  /** Keyed by signaling session id (unique per join attempt). */
  private guests = new Map<string, GuestLink>()
  private roster: RosterEntry[] = []
  private hostPeerId: string
  private maxPlayers: MaxPlayers = 5
  private roomCode: string | null = null
  private chain: SignalingAdapterChain | null = null
  private unsubGuestJoin: (() => void) | null = null
  private connectingGuests = new Set<string>()
  private activeStream: MediaStream | null = null
  private declareSendonlyMedia = false
  private handlers: MultiPeerHostHandlers

  constructor(hostPeerId: string, handlers: MultiPeerHostHandlers) {
    this.hostPeerId = hostPeerId
    this.handlers = handlers
    this.roster = [{ peerId: hostPeerId, role: 'host', seat: 1, status: 'connected' }]
  }

  setMaxPlayers(n: MaxPlayers) {
    this.maxPlayers = n
  }

  setDeclareSendonlyMedia(enabled: boolean) {
    this.declareSendonlyMedia = enabled
  }

  getRoster(): RosterEntry[] {
    return this.roster
  }

  getGuests(): GuestLink[] {
    return [...this.guests.values()]
  }

  setHostSeat(seat: PeerSeat | null) {
    const host = this.roster.find((e) => e.peerId === this.hostPeerId)
    if (host) host.seat = seat
    this.broadcastRoster()
  }

  start(chain: SignalingAdapterChain, roomCode: string) {
    this.chain = chain
    this.roomCode = roomCode
    this.unsubGuestJoin?.()
    this.unsubGuestJoin = chain.onGuestJoin((signalingId, stablePeerId) => {
      void this.handleGuestJoin(signalingId, stablePeerId)
    })
  }

  stop() {
    this.unsubGuestJoin?.()
    this.unsubGuestJoin = null
    for (const g of this.guests.values()) g.connection.close()
    this.guests.clear()
    this.connectingGuests.clear()
    this.activeStream = null
    this.chain = null
    this.roomCode = null
  }

  /** Attach canvas capture to every connected guest (spectators and players). */
  async attachMediaStream(stream: MediaStream): Promise<void> {
    this.activeStream = stream
    await Promise.all(
      [...this.guests.keys()].map((signalingId) => this.attachMediaStreamToGuest(signalingId)),
    )
  }

  private async attachMediaStreamToGuest(signalingId: string): Promise<void> {
    const stream = this.activeStream
    const g = this.guests.get(signalingId)
    if (!stream || !g?.connection.connected) return

    const needsRenegotiation = g.connection.addMediaStream(stream)
    if (!needsRenegotiation) return

    const sdp = await g.connection.createMediaRenegotiationOffer()
    try {
      g.connection.sendControl({ type: 'media-reoffer', sdp })
    } catch {
      // ignore — guest may reconnect
    }
  }

  isSeatAvailable(seat: PeerSeat, exceptPeerId?: string): boolean {
    return !isSeatTaken(this.roster, seat, exceptPeerId)
  }

  claimSeat(peerId: string, seat: PeerSeat | null): boolean {
    if (seat !== null && !this.isSeatAvailable(seat, peerId)) return false
    const entry = this.roster.find((e) => e.peerId === peerId)
    if (entry) entry.seat = seat
    else this.upsertGuestRoster(peerId, { seat, status: 'connected' })
    for (const g of this.guests.values()) {
      if (g.peerId === peerId) g.seat = seat
    }
    this.broadcastRoster()
    return true
  }

  private activeGuestPeerCount(): number {
    const ids = new Set<string>()
    for (const g of this.guests.values()) {
      if (g.connectionState !== 'closed' && g.connectionState !== 'failed') {
        ids.add(g.peerId)
      }
    }
    for (const e of this.roster) {
      if (e.role === 'guest' && e.status === 'connecting') ids.add(e.peerId)
    }
    return ids.size
  }

  private maxGuestConnections(): number {
    // Player guests (maxPlayers - 1) plus the same number of spectators.
    return (this.maxPlayers - 1) * 2
  }

  private upsertGuestRoster(
    peerId: string,
    patch: {
      seat?: PeerSeat | null
      status?: RosterConnectionStatus
      signalingId?: string
      lastSeenAt?: number
    },
  ) {
    const existing = this.roster.find((e) => e.peerId === peerId && e.role === 'guest')
    if (existing) {
      if (patch.seat !== undefined) existing.seat = patch.seat
      if (patch.status !== undefined) existing.status = patch.status
      if (patch.signalingId !== undefined) existing.signalingId = patch.signalingId
      if (patch.lastSeenAt !== undefined) existing.lastSeenAt = patch.lastSeenAt
      return
    }
    this.roster.push({
      peerId,
      role: 'guest',
      seat: patch.seat ?? null,
      status: patch.status ?? 'connecting',
      signalingId: patch.signalingId,
      lastSeenAt: patch.lastSeenAt,
    })
  }

  private setRosterStatus(peerId: string, status: RosterConnectionStatus) {
    const entry = this.roster.find((e) => e.peerId === peerId && e.role === 'guest')
    if (!entry) return
    entry.status = status
    if (status === 'disconnected') entry.lastSeenAt = Date.now()
    if (status === 'connected') entry.signalingId = undefined
  }

  private async handleGuestJoin(signalingId: string, stablePeerId?: string) {
    if (this.connectingGuests.has(signalingId) || this.guests.has(signalingId)) return

    const chain = this.chain
    const code = this.roomCode
    if (!chain || !code) return

    const peerId = stablePeerId ?? signalingId

    if (this.activeGuestPeerCount() >= this.maxGuestConnections()) {
      this.handlers.onError?.('Room is full')
      return
    }

    const prior = this.roster.find(
      (e) => e.peerId === peerId && e.role === 'guest' && e.status === 'disconnected',
    )
    const priorSeat = prior?.seat ?? null

    this.connectingGuests.add(signalingId)
    chain.clearGuestSlot?.(code, signalingId)
    chain.clearAnswer?.(code, signalingId)

    const defaultSeat = priorSeat
    this.upsertGuestRoster(peerId, {
      seat: defaultSeat ?? null,
      status: 'connecting',
      signalingId,
    })
    this.emitRosterChange()

    const conn = new PeerConnection(this.buildConnHandlers(signalingId, peerId), {
      declareSendonlyMedia: this.declareSendonlyMedia,
    })
    try {
      const offer = await conn.createOffer()
      await chain.publishGuestOffer(code, signalingId, offer)
      const answer = await chain.waitForAnswer(code, signalingId)
      await conn.acceptAnswer(answer)

      const link: GuestLink = {
        signalingId,
        peerId,
        seat: defaultSeat,
        connection: conn,
        connectionState: 'connecting',
      }
      this.guests.set(signalingId, link)
      this.setRosterStatus(peerId, 'connected')
      this.broadcastRoster()
      this.handlers.onGuestConnected?.(peerId)
      this.emitRosterChange()
    } catch (err) {
      conn.close()
      this.guests.delete(signalingId)
      this.setRosterStatus(peerId, 'disconnected')
      chain.clearGuestSlot?.(code, signalingId)
      chain.clearAnswer?.(code, signalingId)
      this.emitRosterChange()
      this.handlers.onError?.(err instanceof Error ? err.message : 'Guest connect failed')
    } finally {
      this.connectingGuests.delete(signalingId)
    }
  }

  private buildConnHandlers(signalingId: string, peerId: string): PeerConnectionHandlers {
    return {
      onState: (state) => {
        const g = this.guests.get(signalingId)
        if (g) {
          g.connectionState = state
          if (state === 'connected') {
            this.setRosterStatus(g.peerId, 'connected')
            this.sendRosterTo(signalingId)
            if (this.activeStream) {
              void this.attachMediaStreamToGuest(signalingId)
            }
          }
          this.emitRosterChange()
        }
        if (state === 'disconnected' || state === 'closed' || state === 'failed') {
          this.removeGuest(signalingId)
        }
      },
      onControl: (msg) => this.handleControl(signalingId, peerId, msg),
      onError: (err) => this.handlers.onError?.(err.message),
    }
  }

  private handleControl(signalingId: string, peerId: string, msg: ControlMessage) {
    const g = this.guests.get(signalingId)
    const stableId = g?.peerId ?? peerId

    this.handlers.onGuestControl?.(stableId, msg)

    if (msg.type === 'hello') {
      if (msg.peerId && g && msg.peerId !== g.peerId) {
        const oldId = g.peerId
        g.peerId = msg.peerId
        const oldEntry = this.roster.find((e) => e.peerId === oldId && e.role === 'guest')
        if (oldEntry) oldEntry.peerId = msg.peerId
      }
      this.claimSeat(g?.peerId ?? stableId, msg.seat)
      return
    }
    if (msg.type === 'seat-claim') {
      if (msg.peerId === stableId || !msg.peerId) {
        this.claimSeat(stableId, msg.seat)
      }
      return
    }
    if (msg.type === 'seat-pick') {
      this.claimSeat(stableId, msg.seat)
      return
    }
    if (msg.type === 'input') {
      this.handlers.onRemoteInput(msg.seat, msg.button, msg.down, msg.t)
      return
    }
    if (msg.type === 'ping') {
      try {
        g?.connection.sendControl({ type: 'pong', t: msg.t })
      } catch {
        // ignore
      }
    }
  }

  private removeGuest(signalingId: string) {
    const g = this.guests.get(signalingId)
    const peerId = g?.peerId ?? signalingId
    const code = this.roomCode
    const chain = this.chain

    if (g) {
      g.connection.close()
      this.guests.delete(signalingId)
    }

    this.setRosterStatus(peerId, 'disconnected')
    if (code) {
      chain?.clearGuestSlot?.(code, signalingId)
      chain?.clearAnswer?.(code, signalingId)
    }

    this.handlers.onGuestDisconnected?.(peerId)
    this.broadcastRoster()
    this.emitRosterChange()
  }

  private rosterPeers(): RosterPeer[] {
    return this.roster.map((e) => ({
      peerId: e.peerId,
      role: e.role,
      seat: e.seat,
      name: e.name,
      status: e.status ?? (e.role === 'host' ? 'connected' : 'disconnected'),
    }))
  }

  private emitRosterChange() {
    this.handlers.onRosterChange(this.roster, this.getGuests())
  }

  private broadcastRoster() {
    const peers = this.rosterPeers()
    for (const g of this.guests.values()) {
      if (!g.connection.connected) continue
      try {
        g.connection.sendControl({
          type: 'roster-update',
          peers,
          maxPlayers: this.maxPlayers,
        })
      } catch {
        // ignore
      }
    }
  }

  sendRosterTo(signalingId: string) {
    const g = this.guests.get(signalingId)
    if (!g?.connection.connected) return
    try {
      g.connection.sendControl({
        type: 'roster-update',
        peers: this.rosterPeers(),
        maxPlayers: this.maxPlayers,
      })
    } catch {
      // ignore
    }
  }

  broadcastControl(msg: ControlMessage) {
    for (const g of this.guests.values()) {
      if (!g.connection.connected) continue
      try {
        g.connection.sendControl(msg)
      } catch {
        // ignore
      }
    }
  }
}
