import { getIceConfig } from './connectivity'

export interface PeerJsBrokerConfig {
  host: string
  port: number
  path: string
  secure: boolean
}

export interface PeerJsClientOptions {
  host: string
  port: number
  path: string
  secure: boolean
  config: RTCConfiguration
}

function envBroker(): PeerJsBrokerConfig | null {
  const host = import.meta.env.VITE_PEERJS_HOST as string | undefined
  if (!host) return null
  return {
    host,
    port: Number(import.meta.env.VITE_PEERJS_PORT ?? 443),
    path: (import.meta.env.VITE_PEERJS_PATH as string | undefined) ?? '/',
    secure: import.meta.env.VITE_PEERJS_SECURE !== 'false',
  }
}

function parseFallbackHosts(): PeerJsBrokerConfig[] {
  const raw = import.meta.env.VITE_PEERJS_FALLBACK_HOSTS as string | undefined
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
    .map((host) => ({ host, port: 443, path: '/', secure: true }))
}

/** Ordered PeerJS brokers — host and guest must use the same index. */
export function listPeerJsBrokers(): PeerJsBrokerConfig[] {
  const seen = new Set<string>()
  const brokers: PeerJsBrokerConfig[] = []

  const add = (broker: PeerJsBrokerConfig) => {
    const key = `${broker.host}:${broker.port}${broker.path}`
    if (seen.has(key)) return
    seen.add(key)
    brokers.push(broker)
  }

  const custom = envBroker()
  if (custom) add(custom)

  add({ host: '0.peerjs.com', port: 443, path: '/', secure: true })

  for (const fallback of parseFallbackHosts()) {
    add(fallback)
  }

  return brokers
}

export function buildPeerJsClientOptions(brokerIndex = 0): PeerJsClientOptions {
  const brokers = listPeerJsBrokers()
  const broker = brokers[brokerIndex] ?? brokers[0]!
  return {
    ...broker,
    config: { iceServers: getIceConfig('relay').iceServers },
  }
}

export function resolvePeerJsBrokerIndex(
  metaIndex?: number,
  urlIndex?: number | null,
): number {
  if (metaIndex !== undefined && metaIndex >= 0) return metaIndex
  if (urlIndex !== null && urlIndex !== undefined && urlIndex >= 0) return urlIndex
  return 0
}
