import type { MaxPlayers } from './roster'

export type GuestSlot = {
  guestId: string
  offer?: string
  answer?: string
  joinedAt: number
}

export type MultiGuestRoomRecord = {
  offer?: string
  answer?: string
  meta?: { mode?: string; maxPlayers?: MaxPlayers; multiGuest?: boolean }
  guests?: Record<string, GuestSlot>
  updatedAt: number
}

export type GuestJoinHandler = (guestId: string) => void

export type GuestSignalingMessage =
  | { type: 'join-request'; guestId: string }
  | { type: 'webrtc-offer'; guestId: string; offer: string }
  | { type: 'webrtc-answer'; guestId: string; answer: string }
  | { type: 'offer'; offer: string }
  | { type: 'answer'; answer: string }
