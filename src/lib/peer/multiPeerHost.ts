import { PeerConnection, type PeerConnectionHandlers, type PeerConnectionState } from './connection'
import type { ControlMessage, PeerSeat, RosterPeer } from './protocol'
import type { MaxPlayers, RosterEntry } from './roster'
import { findFreeSeat, isSeatTaken } from './roster'
import type { SignalingAdapterChain } from './signaling'

export interface GuestLink {
  peerId: string
  seat: PeerSeat | null
  connection: PeerConnection
  connectionState: PeerConnectionState
}

export interface MultiPeerHostHandlers {
  onRemoteInput: (seat: PeerSeat, button: string, down: boolean, executeAt?: number) => void
  onRosterChange: (roster: RosterEntry[], guests: GuestLink[]) => void
  onGuestConnected?: (peerId: string) => void
  onGuestDisconnected?: (peerId: string) => void
  onError?: (message: string) => void
}

export class MultiPeerHostManager {
  private guests = new Map<string, GuestLink>()
  private roster: RosterEntry[] = []
  private hostPeerId: string
  private maxPlayers: MaxPlayers = 5
  private roomCode: string | null = null
  private chain: SignalingAdapterChain | null = null
  private unsubGuestJoin: (() => void) | null = null
  private handlers: MultiPeerHostHandlers

  constructor(hostPeerId: string, handlers: MultiPeerHostHandlers) {
    this.hostPeerId = hostPeerId
    this.handlers = handlers
    this.roster = [{ peerId: hostPeerId, role: 'host', seat: 1 }]
  }

  setMaxPlayers(n: MaxPlayers) {
    this.maxPlayers = n
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
    this.unsubGuestJoin = chain.onGuestJoin((guestId) => {
      void this.handleGuestJoin(guestId)
    })
  }

  stop() {
    this.unsubGuestJoin?.()
    this.unsubGuestJoin = null
    for (const g of this.guests.values()) g.connection.close()
    this.guests.clear()
    this.chain = null
    this.roomCode = null
  }

  isSeatAvailable(seat: PeerSeat, exceptPeerId?: string): boolean {
    return !isSeatTaken(this.roster, seat, exceptPeerId)
  }

  claimSeat(peerId: string, seat: PeerSeat | null): boolean {
    if (seat !== null && !this.isSeatAvailable(seat, peerId)) return false
    const entry = this.roster.find((e) => e.peerId === peerId)
    if (entry) entry.seat = seat
    else this.roster.push({ peerId, role: 'guest', seat })
    const guest = this.guests.get(peerId)
    if (guest) guest.seat = seat
    this.broadcastRoster()
    return true
  }

  private async handleGuestJoin(guestId: string) {
    if (this.guests.has(guestId)) return
    const chain = this.chain
    const code = this.roomCode
    if (!chain || !code) return
    if (this.guests.size >= this.maxPlayers - 1) {
      this.handlers.onError?.('Room is full')
      return
    }

    const conn = new PeerConnection(this.buildConnHandlers(guestId))
    try {
      const offer = await conn.createOffer()
      await chain.publishGuestOffer(code, guestId, offer)
      const answer = await chain.waitForAnswer(code, guestId)
      await conn.acceptAnswer(answer)

      const defaultSeat = findFreeSeat(this.roster, this.maxPlayers)
      const link: GuestLink = {
        peerId: guestId,
        seat: defaultSeat,
        connection: conn,
        connectionState: 'connecting',
      }
      this.guests.set(guestId, link)
      if (defaultSeat) {
        this.roster.push({ peerId: guestId, role: 'guest', seat: defaultSeat })
      } else {
        this.roster.push({ peerId: guestId, role: 'guest', seat: null })
      }
      this.broadcastRoster()
      this.handlers.onGuestConnected?.(guestId)
      this.handlers.onRosterChange(this.roster, this.getGuests())
    } catch (err) {
      conn.close()
      this.handlers.onError?.(err instanceof Error ? err.message : 'Guest connect failed')
    }
  }

  private buildConnHandlers(guestId: string): PeerConnectionHandlers {
    return {
      onState: (state) => {
        const g = this.guests.get(guestId)
        if (g) {
          g.connectionState = state
          this.handlers.onRosterChange(this.roster, this.getGuests())
        }
        if (state === 'disconnected' || state === 'closed' || state === 'failed') {
          this.removeGuest(guestId)
        }
      },
      onControl: (msg) => this.handleControl(guestId, msg),
      onError: (err) => this.handlers.onError?.(err.message),
    }
  }

  private handleControl(guestId: string, msg: ControlMessage) {
    if (msg.type === 'hello') {
      const seat = msg.seat
      this.claimSeat(guestId, seat)
      return
    }
    if (msg.type === 'seat-claim') {
      if (msg.peerId === guestId || !msg.peerId) {
        this.claimSeat(guestId, msg.seat)
      }
      return
    }
    if (msg.type === 'seat-pick') {
      this.claimSeat(guestId, msg.seat)
      return
    }
    if (msg.type === 'input') {
      this.handlers.onRemoteInput(msg.seat, msg.button, msg.down, msg.t)
      return
    }
    if (msg.type === 'ping') {
      const g = this.guests.get(guestId)
      try {
        g?.connection.sendControl({ type: 'pong', t: msg.t })
      } catch {
        // ignore
      }
    }
  }

  private removeGuest(peerId: string) {
    const g = this.guests.get(peerId)
    if (g) {
      g.connection.close()
      this.guests.delete(peerId)
    }
    this.roster = this.roster.filter((e) => e.peerId !== peerId || e.role === 'host')
    this.handlers.onGuestDisconnected?.(peerId)
    this.broadcastRoster()
    this.handlers.onRosterChange(this.roster, this.getGuests())
  }

  private broadcastRoster() {
    const peers: RosterPeer[] = this.roster.map((e) => ({
      peerId: e.peerId,
      role: e.role,
      seat: e.seat,
    }))
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

  sendRosterTo(guestId: string) {
    const g = this.guests.get(guestId)
    if (!g?.connection.connected) return
    const peers: RosterPeer[] = this.roster.map((e) => ({
      peerId: e.peerId,
      role: e.role,
      seat: e.seat,
    }))
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
