import { useCallback, useState } from 'react'
import type { SessionMode } from '../../lib/peer/protocol'
import type { SignalingAdapterName } from '../../lib/peer/signaling'
import type { DegradationReason, SessionRouterState } from './types'

export function useSessionRouter(initialMode: SessionMode = 'local'): SessionRouterState {
  const [sessionMode, setSessionMode] = useState<SessionMode>(initialMode)
  const [signalingPath, setSignalingPath] = useState<SignalingAdapterName>('manual')
  const [degradationReason, setDegradationReason] = useState<DegradationReason>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinUrl, setJoinUrl] = useState<string | null>(null)
  const [hostOnScreenP2, setHostOnScreenP2] = useState(false)

  const setMode = useCallback((mode: SessionMode) => {
    setSessionMode(mode)
  }, [])

  return {
    sessionMode,
    setSessionMode: setMode,
    remoteMode: sessionMode,
    signalingPath,
    degradationReason,
    setDegradationReason,
    roomCode,
    joinUrl,
    hostOnScreenP2,
    setHostOnScreenP2,
    // internal setters exposed for peer session hook via ref pattern in App
    _setSignalingPath: setSignalingPath,
    _setRoomCode: setRoomCode,
    _setJoinUrl: setJoinUrl,
  } as SessionRouterState & {
    _setSignalingPath: (v: SignalingAdapterName) => void
    _setRoomCode: (v: string | null) => void
    _setJoinUrl: (v: string | null) => void
  }
}
