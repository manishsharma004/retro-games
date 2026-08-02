export type ConnectivityTier = 'stun' | 'turn' | 'manual'

/** ICE gathering phase: local LAN/STUN first, TURN relay only as fallback. */
export type IceTier = 'local' | 'relay'

export type ConnectionPath = 'local' | 'stun' | 'relay' | 'unknown'

export interface IceConfig {
  iceServers: RTCIceServer[]
  tier: IceTier
  connectivityTier: ConnectivityTier
  iceTransportPolicy?: RTCIceTransportPolicy
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
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: ['turn:turn.freeturn.net:3478', 'turn:turn.freeturn.net:5349'],
    username: 'free',
    credential: 'free',
  },
  {
    urls: 'turn:relay.backups.cz',
    username: 'free',
    credential: 'free',
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
export function getIceConfig(tier: IceTier = 'local', forceRelay = false): IceConfig {
  const turn = allTurnServers()
  const iceServers = dedupeIceServers([...STUN_SERVERS, ...turn])
  return {
    iceServers,
    tier,
    connectivityTier: turn.length > 0 ? 'turn' : 'stun',
    iceTransportPolicy: forceRelay ? 'relay' : 'all',
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
/** Cross-network remote play — TURN on mobile can take longer. */
export const ICE_REMOTE_CONNECT_TIMEOUT_MS = 45_000
/** Remote play: try direct/STUN before escalating to TURN (same-phone multi-browser). */
export const ICE_REMOTE_LOCAL_RETRY_MS = 5_000
export const ICE_LOCAL_RETRY_MS = 8_000

export type IceCandidateKind = 'host' | 'srflx' | 'prflx' | 'relay'

export interface ConnectivityProbeResult {
  /** At least one ICE candidate was gathered. */
  reachable: boolean
  kinds: Record<IceCandidateKind, boolean>
  /** Direct (host/srflx) paths appear blocked — common on VPN or symmetric NAT. */
  directBlocked: boolean
  /** No TURN relay candidates — VPN users often need these. */
  relayUnavailable: boolean
  /** Short summary for logs / advanced UI. */
  summary: string
  /** User-facing hints (VPN, firewall, TURN). */
  hints: string[]
}

function parseCandidateKind(candidate: RTCIceCandidate): IceCandidateKind | null {
  const type = candidate.type
  if (type === 'host' || type === 'srflx' || type === 'prflx' || type === 'relay') return type
  const line = candidate.candidate ?? ''
  if (line.includes(' typ host ')) return 'host'
  if (line.includes(' typ srflx ')) return 'srflx'
  if (line.includes(' typ prflx ')) return 'prflx'
  if (line.includes(' typ relay ')) return 'relay'
  return null
}

/**
 * Lightweight ICE probe — checks whether this browser can gather direct and/or relay
 * candidates. Useful when a session fails on VPN, corporate networks, or strict NAT.
 */
export async function probeIceConnectivity(timeoutMs = 6_000): Promise<ConnectivityProbeResult> {
  const kinds: Record<IceCandidateKind, boolean> = {
    host: false,
    srflx: false,
    prflx: false,
    relay: false,
  }

  if (typeof RTCPeerConnection === 'undefined') {
    return {
      reachable: false,
      kinds,
      directBlocked: true,
      relayUnavailable: true,
      summary: 'WebRTC unavailable in this environment',
      hints: ['WebRTC is not available in this browser or context.'],
    }
  }

  const pc = new RTCPeerConnection(getIceConfig('local'))
  const onCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) return
    const kind = parseCandidateKind(event.candidate)
    if (kind) kinds[kind] = true
  }
  pc.addEventListener('icecandidate', onCandidate)

  try {
    pc.createDataChannel('retro-games-probe')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        pc.removeEventListener('icegatheringstatechange', onGathering)
        window.clearTimeout(timer)
        resolve()
      }
      const onGathering = () => {
        if (pc.iceGatheringState === 'complete') finish()
      }
      pc.addEventListener('icegatheringstatechange', onGathering)
      const timer = window.setTimeout(finish, timeoutMs)
      if (pc.iceGatheringState === 'complete') finish()
    })
  } catch {
    // fall through to result assembly
  } finally {
    pc.removeEventListener('icecandidate', onCandidate)
    pc.close()
  }

  const reachable = Object.values(kinds).some(Boolean)
  const hasDirect = kinds.host || kinds.srflx || kinds.prflx
  const hasRelay = kinds.relay
  const directBlocked = reachable && !hasDirect
  const relayUnavailable = !hasRelay

  const hints: string[] = []
  if (!reachable) {
    hints.push(
      'No ICE candidates were gathered — WebRTC may be blocked by a VPN, firewall, or browser policy.',
    )
    hints.push('Try disabling VPN, switching networks, or using manual SDP paste in Advanced options.')
  } else if (directBlocked && hasRelay) {
    hints.push(
      'Direct connections look blocked (common on VPN or strict NAT). The app will use a TURN relay — expect higher latency.',
    )
    hints.push('For best results, disable VPN on at least one device or use the same Wi‑Fi/hotspot.')
  } else if (directBlocked && !hasRelay) {
    hints.push(
      'Neither direct nor relay (TURN) paths are available — VPN or firewall is likely blocking WebRTC.',
    )
    hints.push('Disable VPN, allow UDP/TURN traffic, or set VITE_TURN_URL to a reachable relay.')
  } else if (relayUnavailable) {
    hints.push(
      'TURN relay servers were not reachable. Cross-network play may fail if direct paths do not work.',
    )
  }

  let summary = 'Direct and relay paths available'
  if (!reachable) summary = 'No ICE candidates'
  else if (directBlocked && hasRelay) summary = 'Relay only (direct blocked)'
  else if (directBlocked) summary = 'Direct blocked, relay unavailable'
  else if (relayUnavailable) summary = 'Direct only (relay unreachable)'

  return { reachable, kinds, directBlocked, relayUnavailable, summary, hints }
}

/** Merge probe hints into a connection error for display. */
export function enrichConnectionError(message: string, probe: ConnectivityProbeResult | null): string {
  if (!probe?.hints.length) return message
  const extra = probe.hints[0]
  if (message.includes(extra)) return message
  return `${message} ${extra}`
}
