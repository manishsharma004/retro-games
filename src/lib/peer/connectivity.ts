export type ConnectivityTier = 'stun' | 'turn' | 'manual'

/** ICE gathering phase: local LAN/STUN first, TURN relay only as fallback. */
export type IceTier = 'local' | 'relay'

export type ConnectionPath = 'local' | 'stun' | 'relay' | 'unknown'

export interface IceConfig {
  iceServers: RTCIceServer[]
  tier: IceTier
  connectivityTier: ConnectivityTier
}

/** Free public STUN servers — always included. */
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.mozilla.org:3478' },
]

/** PeerJS cloud TURN — used by PeerJS DataConnections by default. */
const PEERJS_TURN_SERVERS: RTCIceServer[] = [
  {
    urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
    username: 'peerjs',
    credential: 'peerjsp',
  },
]

/**
 * Free public TURN relay (Open Relay Project / Metered).
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

function dedupeIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>()
  const out: RTCIceServer[] = []
  for (const server of servers) {
    const urls = Array.isArray(server.urls) ? server.urls.join('|') : server.urls
    const key = `${urls}:${server.username ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(server)
  }
  return out
}

function allTurnServers(): RTCIceServer[] {
  return [...PEERJS_TURN_SERVERS, ...FREE_TURN_SERVERS, ...readCustomTurnServers()]
}

/**
 * Local tier: STUN + TURN gathered up front — ICE still prefers LAN/direct when available.
 * Relay tier: same servers; triggers ICE restart with relay preference on fallback.
 */
export function getIceConfig(tier: IceTier = 'local'): IceConfig {
  const turn = allTurnServers()
  const iceServers = dedupeIceServers([...STUN_SERVERS, ...turn])
  return {
    iceServers,
    tier,
    connectivityTier: turn.length > 0 ? 'turn' : 'stun',
  }
}

export function formatConnectionPath(path: ConnectionPath): string {
  switch (path) {
    case 'local':
      return 'Local Wi‑Fi / LAN'
    case 'stun':
      return 'Direct (internet)'
    case 'relay':
      return 'Relay (TURN)'
    case 'unknown':
      return 'Connecting…'
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

export const ICE_CONNECT_TIMEOUT_MS = 25_000
export const ICE_LOCAL_RETRY_MS = 8_000
