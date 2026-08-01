import type { SignalingAdapterName } from '../../lib/peer/signaling'
import type { SessionMode } from '../../lib/peer/protocol'

export type DegradationReason =
  | null
  | 'signaling-manual'
  | 'signaling-peerjs'
  | 'signaling-broadcast'
  | 'video-only'
  | 'coop-raw-state'
  | 'ice-retry'
  | 'mode-suggest-remote'
  | 'mode-suggest-coop'
  | 'mode-suggest-local'

export interface SessionRouterState {
  sessionMode: SessionMode
  setSessionMode: (mode: SessionMode) => void
  remoteMode: SessionMode
  signalingPath: SignalingAdapterName
  degradationReason: DegradationReason
  setDegradationReason: (reason: DegradationReason) => void
  roomCode: string | null
  joinUrl: string | null
  hostOnScreenP2: boolean
  setHostOnScreenP2: (on: boolean) => void
}

export interface ModeHookBase {
  enabled: boolean
}
