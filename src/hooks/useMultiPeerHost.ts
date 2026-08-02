import { useCallback, useEffect, useRef, useState } from 'react'
import type { ControlMessage } from '../lib/peer/protocol'
import { MultiPeerHostManager, type GuestLink } from '../lib/peer/multiPeerHost'
import type { PeerSeat } from '../lib/peer/protocol'
import type { MaxPlayers, RosterEntry } from '../lib/peer/roster'
import type { SignalingAdapterChain } from '../lib/peer/signaling'

export interface UseMultiPeerHostOptions {
  hostPeerId: string
  onRemoteInput: (seat: PeerSeat, button: string, down: boolean, executeAt?: number) => void
  onGuestConnected?: (peerId: string) => void
  onError?: (message: string) => void
}

export function useMultiPeerHost({ hostPeerId, onRemoteInput, onGuestConnected, onError }: UseMultiPeerHostOptions) {
  const onRemoteInputRef = useRef(onRemoteInput)
  const onGuestConnectedRef = useRef(onGuestConnected)
  const onErrorRef = useRef(onError)
  onRemoteInputRef.current = onRemoteInput
  onGuestConnectedRef.current = onGuestConnected
  onErrorRef.current = onError

  const managerRef = useRef<MultiPeerHostManager | null>(null)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [guests, setGuests] = useState<GuestLink[]>([])

  useEffect(() => {
    const manager = new MultiPeerHostManager(hostPeerId, {
      onRemoteInput: (seat, button, down, executeAt) =>
        onRemoteInputRef.current(seat, button, down, executeAt),
      onRosterChange: (nextRoster, nextGuests) => {
        setRoster(nextRoster)
        setGuests(nextGuests)
      },
      onGuestConnected: (peerId) => onGuestConnectedRef.current?.(peerId),
      onError: (message) => onErrorRef.current?.(message),
    })
    managerRef.current = manager
    return () => {
      manager.stop()
      managerRef.current = null
    }
  }, [hostPeerId])

  const start = useCallback(
    (
      chain: SignalingAdapterChain,
      roomCode: string,
      maxPlayers: MaxPlayers,
      opts?: { remotePlay?: boolean },
    ) => {
      const manager = managerRef.current
      if (!manager) return
      manager.setMaxPlayers(maxPlayers)
      manager.setRemotePlay(opts?.remotePlay ?? false)
      manager.start(chain, roomCode)
    setRoster(manager.getRoster())
    setGuests(manager.getGuests())
  }, [])

  const stop = useCallback(() => {
    managerRef.current?.stop()
    setGuests([])
  }, [])

  const setHostSeat = useCallback((seat: PeerSeat | null) => {
    managerRef.current?.setHostSeat(seat)
    setRoster(managerRef.current?.getRoster() ?? [])
  }, [])

  const claimSeat = useCallback((peerId: string, seat: PeerSeat | null) => {
    const ok = managerRef.current?.claimSeat(peerId, seat) ?? false
    setRoster(managerRef.current?.getRoster() ?? [])
    return ok
  }, [])

  const isSeatAvailable = useCallback((seat: PeerSeat, exceptPeerId?: string) => {
    return managerRef.current?.isSeatAvailable(seat, exceptPeerId) ?? true
  }, [])

  const broadcastControl = useCallback((msg: ControlMessage) => {
    managerRef.current?.broadcastControl(msg)
  }, [])

  const attachMediaStream = useCallback(async (stream: MediaStream) => {
    await managerRef.current?.attachMediaStream(stream)
  }, [])

  return {
    roster,
    guests,
    connectedGuestCount: guests.filter((g) => g.connectionState === 'connected').length,
    start,
    stop,
    setHostSeat,
    claimSeat,
    isSeatAvailable,
    broadcastControl,
    attachMediaStream,
  }
}
