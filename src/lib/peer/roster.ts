import type { PeerParticipationSeat, PeerRole, PeerSeat } from './protocol'

export type RosterConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export interface RosterEntry {
  peerId: string
  role: PeerRole
  seat: PeerParticipationSeat
  name?: string
  /** Live connection state — guests stay listed when disconnected for rejoin tracking. */
  status?: RosterConnectionStatus
  lastSeenAt?: number
  /** Active signaling session id while connected or handshaking. */
  signalingId?: string
}

export const MAX_SNES_PLAYERS = 5 as const
export type MaxPlayers = 2 | 3 | 4 | 5

export function clampMaxPlayers(n: number): MaxPlayers {
  if (n >= 5) return 5
  if (n >= 4) return 4
  if (n >= 3) return 3
  return 2
}

export function isPlayerSeat(seat: PeerParticipationSeat): seat is PeerSeat {
  return seat !== null
}

export function isSeatTaken(roster: RosterEntry[], seat: PeerSeat, exceptPeerId?: string): boolean {
  return roster.some((e) => e.seat === seat && e.peerId !== exceptPeerId)
}

export function findFreeSeat(roster: RosterEntry[], maxPlayers: MaxPlayers): PeerSeat | null {
  for (let s = 1 as PeerSeat; s <= maxPlayers; s = (s + 1) as PeerSeat) {
    if (!isSeatTaken(roster, s)) return s
  }
  return null
}

export function rosterSeatsInUse(roster: RosterEntry[]): Set<PeerSeat> {
  const set = new Set<PeerSeat>()
  for (const e of roster) {
    if (e.seat !== null) set.add(e.seat)
  }
  return set
}

export function playerSeats(max: MaxPlayers): PeerSeat[] {
  return Array.from({ length: max }, (_, i) => (i + 1) as PeerSeat)
}
