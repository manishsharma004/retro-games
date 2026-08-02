import { PeerConnection, type PeerConnectionHandlers, type PeerConnectionState } from './connection'
import type { ControlMessage, PeerSeat, RosterPeer } from './protocol'
import type { MaxPlayers, RosterConnectionStatus, RosterEntry } from './roster'
import { isSeatTaken } from './roster'
import { isMlineOrderError, offerFingerprint } from './sdpUtils'
import type { SignalingAdapterChain } from './signaling'

export interface GuestLink {
  signalingId: string
  peerId: string
  seat: PeerSeat | null
  connection: PeerConnection
  connectionState: PeerConnectionState
  /** True once the data channel opened — avoids tearing down mid-handshake. */
  wasConnected: boolean
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
  private unsubGuestSession: (() => void) | null = null
  private connectingGuests = new Set<string>()
  private activeStream: MediaStream | null = null
  private remotePlay = false
  private handlers: MultiPeerHostHandlers

  constructor(hostPeerId: string, handlers: MultiPeerHostHandlers) {
    this.hostPeerId = hostPeerId
    this.handlers = handlers
    this.roster = [{ peerId: hostPeerId, role: 'host', seat: 1, status: 'connected' }]
  }

  setMaxPlayers(n: MaxPlayers) {
    this.maxPlayers = n
  }

  setRemotePlay(enabled: boolean) {
    this.remotePlay = enabled
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
    this.unsubGuestSession?.()
    this.unsubGuestJoin = chain.onGuestJoin((signalingId, stablePeerId, initialSeat, sameBrowser) => {
      void this.handleGuestJoin(signalingId, stablePeerId, initialSeat, sameBrowser)
    })
    this.unsubGuestSession = chain.onGuestSessionMessage((guestId, data) => {
      if (!guestId) return
      const msg = data as { type?: string; sdp?: string }
      const g = this.guests.get(guestId)
      if (!g) return
      if (msg.type === 'ice-reanswer' && msg.sdp) {
        void g.connection.acceptRenegotiationAnswer(msg.sdp).catch((err) => {
          this.handlers.onError?.(
            err instanceof Error ? err.message : 'ICE renegotiation failed',
          )
        })
        return
      }
      if (msg.type === 'media-reanswer' && msg.sdp) {
        void g.connection.acceptMediaRenegotiationAnswer(msg.sdp).catch((err) => {
          this.handlers.onError?.(
            err instanceof Error ? err.message : 'Video stream negotiation failed',
          )
        })
      }
    })
  }

  stop() {
    this.unsubGuestJoin?.()
    this.unsubGuestJoin = null
    this.unsubGuestSession?.()
    this.unsubGuestSession = null
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

  private async sendMediaOffer(signalingId: string, sdp: string): Promise<void> {
    const g = this.guests.get(signalingId)
    if (!g) return
    const payload = { type: 'media-reoffer' as const, sdp }
    try {
      await this.chain?.sendGuestSessionMessage(signalingId, payload)
      return
    } catch {
      // fall through to data channel
    }
    g.connection.sendControl(payload)
  }

  private async attachMediaStreamToGuest(signalingId: string, attempt = 0): Promise<void> {
    const stream = this.activeStream
    const g = this.guests.get(signalingId)
    if (!stream || !g) return
    if (!g.connection.connected) {
      if (attempt < 24) {
        await new Promise((r) => window.setTimeout(r, 500))
        return this.attachMediaStreamToGuest(signalingId, attempt + 1)
      }
      return
    }

    try {
      const needsRenegotiation = await g.connection.addMediaStream(stream)
      if (!needsRenegotiation && !this.remotePlay) return
      const sdp = await g.connection.createMediaRenegotiationOffer()
      await this.sendMediaOffer(signalingId, sdp)
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error ? err.message : 'Video stream negotiation failed',
      )
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

  private guestFailTimers = new Map<string, number>()

  private clearGuestFailTimer(signalingId: string) {
    const t = this.guestFailTimers.get(signalingId)
    if (t !== undefined) {
      window.clearTimeout(t)
      this.guestFailTimers.delete(signalingId)
    }
  }

  private cancelGuestAttempt(signalingId: string) {
    this.clearGuestFailTimer(signalingId)
    const g = this.guests.get(signalingId)
    const peerId = g?.peerId
    if (g) {
      g.connection.close()
      this.guests.delete(signalingId)
    }
    this.connectingGuests.delete(signalingId)
    const code = this.roomCode
    if (code) {
      this.chain?.clearGuestSlot?.(code, signalingId)
      this.chain?.clearAnswer?.(code, signalingId)
    }
    if (peerId) this.setRosterStatus(peerId, 'disconnected')
  }

  private async handleGuestJoin(
    signalingId: string,
    stablePeerId?: string,
    initialSeat?: PeerSeat | null,
    _sameBrowser?: boolean,
  ) {
    if (this.connectingGuests.has(signalingId) || this.guests.has(signalingId)) return

    const chain = this.chain
    const code = this.roomCode
    if (!chain || !code) return

    const peerId = stablePeerId ?? signalingId

    for (const [sid, g] of this.guests) {
      if (g.peerId === peerId && sid !== signalingId) {
        this.cancelGuestAttempt(sid)
      }
    }

    if (this.activeGuestPeerCount() >= this.maxGuestConnections()) {
      this.handlers.onError?.('Room is full')
      return
    }

    const staleConnecting = this.roster.find(
      (e) =>
        e.role === 'guest' &&
        e.peerId === peerId &&
        e.status === 'connecting' &&
        e.signalingId &&
        e.signalingId !== signalingId,
    )
    if (staleConnecting?.signalingId) {
      this.cancelGuestAttempt(staleConnecting.signalingId)
    }

    const prior = this.roster.find(
      (e) => e.peerId === peerId && e.role === 'guest' && e.status === 'disconnected',
    )
    const defaultSeat =
      initialSeat !== undefined ? initialSeat : (prior?.seat ?? null)

    this.connectingGuests.add(signalingId)
    chain.clearGuestStorage?.(code, signalingId)
    chain.clearAnswer?.(code, signalingId)
    this.upsertGuestRoster(peerId, {
      seat: defaultSeat ?? null,
      status: 'connecting',
      signalingId,
    })
    this.emitRosterChange()

    const conn = new PeerConnection(this.buildConnHandlers(signalingId, peerId), {
      remotePlay: this.remotePlay,
    })
    try {
      const offer = await conn.createOffer()
      const fp = offerFingerprint(offer)
      await chain.publishGuestOffer(code, signalingId, offer)

      const link: GuestLink = {
        signalingId,
        peerId,
        seat: defaultSeat,
        connection: conn,
        connectionState: conn.connected ? 'connected' : 'connecting',
        wasConnected: conn.connected,
      }
      this.guests.set(signalingId, link)

      const acceptGuestAnswer = async () => {
        const answer = await chain.waitForAnswer(code, signalingId, fp)
        try {
          await conn.acceptAnswer(answer)
        } catch (err) {
          if (isMlineOrderError(err)) {
            chain.clearAnswer?.(code, signalingId)
            return acceptGuestAnswer()
          }
          throw err
        }
      }
      await acceptGuestAnswer()

      if (conn.connected) {
        this.setRosterStatus(peerId, 'connected')
        this.sendRosterTo(signalingId)
        if (this.activeStream) {
          void this.attachMediaStreamToGuest(signalingId)
        }
      }

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
            g.wasConnected = true
            this.clearGuestFailTimer(signalingId)
            this.setRosterStatus(g.peerId, 'connected')
            this.sendRosterTo(signalingId)
            if (this.activeStream) {
              void this.attachMediaStreamToGuest(signalingId)
            }
          }
          this.emitRosterChange()
        }
        if (state === 'failed') {
          this.clearGuestFailTimer(signalingId)
          const timer = window.setTimeout(() => {
            this.guestFailTimers.delete(signalingId)
            const link = this.guests.get(signalingId)
            if (link && (link.connectionState === 'failed' || link.connectionState === 'closed')) {
              this.removeGuest(signalingId)
            }
          }, 12_000)
          this.guestFailTimers.set(signalingId, timer)
          return
        }
        if (state === 'disconnected' || state === 'closed') {
          const link = this.guests.get(signalingId)
          if (!link?.wasConnected) return
          this.removeGuest(signalingId)
        }
      },
      onRenegotiationOffer: (signal, tier) => {
        void this.chain
          ?.sendGuestSessionMessage(signalingId, {
            type: 'ice-reoffer',
            sdp: signal,
            tier,
          })
          .catch((err) => {
            this.handlers.onError?.(
              err instanceof Error ? err.message : 'ICE renegotiation signaling failed',
            )
          })
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
      return
    }
    if (msg.type === 'media-reanswer' && msg.sdp) {
      void g?.connection.acceptMediaRenegotiationAnswer(msg.sdp).catch((err) => {
        this.handlers.onError?.(
          err instanceof Error ? err.message : 'Video stream negotiation failed',
        )
      })
    }
  }

  private removeGuest(signalingId: string) {
    this.clearGuestFailTimer(signalingId)
    const g = this.guests.get(signalingId)
    if (!g) return

    const peerId = g.peerId
    const code = this.roomCode
    const chain = this.chain

    g.connection.close()
    this.guests.delete(signalingId)

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
