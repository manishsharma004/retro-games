export type ConnectivityTier = 'stun' | 'turn' | 'manual'

export interface IceConfig {
  iceServers: RTCIceServer[]
  tier: ConnectivityTier
}

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.mozilla.org:3478' },
]

function readTurnServers(): RTCIceServer[] {
  const url = import.meta.env.VITE_TURN_URL as string | undefined
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined
  if (!url) return []
  return [{ urls: url, username, credential }]
}

/** ICE server list: STUN first, optional TURN from env. */
export function getIceConfig(preferTurn = false): IceConfig {
  const turn = readTurnServers()
  if (preferTurn && turn.length > 0) {
    return { iceServers: [...STUN_SERVERS, ...turn], tier: 'turn' }
  }
  if (turn.length > 0) {
    return { iceServers: [...STUN_SERVERS, ...turn], tier: 'turn' }
  }
  return { iceServers: STUN_SERVERS, tier: 'stun' }
}

export function supportsCanvasCapture(): boolean {
  if (typeof HTMLCanvasElement === 'undefined') return false
  const proto = HTMLCanvasElement.prototype as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream
  }
  return typeof proto.captureStream === 'function'
}

export function readNetworkQuality(): 'wifi' | 'cellular' | 'unknown' {
  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean }
    }
  ).connection
  if (!conn) return 'unknown'
  if (conn.saveData) return 'cellular'
  const t = conn.effectiveType ?? ''
  if (t === 'slow-2g' || t === '2g' || t === '3g') return 'cellular'
  return 'wifi'
}

/** Suggested capture FPS based on network. */
export function suggestedCaptureFps(): number {
  return readNetworkQuality() === 'cellular' ? 30 : 60
}

export const ICE_CONNECT_TIMEOUT_MS = 15_000
