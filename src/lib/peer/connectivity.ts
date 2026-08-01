export type ConnectivityTier = 'stun' | 'turn' | 'manual'

export interface IceConfig {
  iceServers: RTCIceServer[]
  tier: ConnectivityTier
}

/** Free public STUN servers — always included. */
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.mozilla.org:3478' },
]

/**
 * Free public TURN relay (Open Relay Project / Metered) — included by default so
 * cross-NAT connections work without any env configuration.
 * @see https://www.metered.ca/tools/openrelay/
 */
const FREE_TURN_SERVERS: RTCIceServer[] = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

function readCustomTurnServers(): RTCIceServer[] {
  const url = import.meta.env.VITE_TURN_URL as string | undefined
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined
  if (!url) return []
  return [{ urls: url, username, credential }]
}

/** ICE servers: public STUN + free Open Relay TURN by default; custom TURN via env adds on top. */
export function getIceConfig(preferTurn = false): IceConfig {
  const customTurn = readCustomTurnServers()
  const turnServers = [...FREE_TURN_SERVERS, ...customTurn]
  const iceServers = [...STUN_SERVERS, ...turnServers]
  return {
    iceServers,
    tier: preferTurn || turnServers.length > 0 ? 'turn' : 'stun',
  }
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

export const ICE_CONNECT_TIMEOUT_MS = 20_000
