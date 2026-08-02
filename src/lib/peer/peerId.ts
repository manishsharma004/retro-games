const PEER_ID_KEY = 'retro-games-peer-id'

export function getPeerId(): string {
  try {
    const existing = sessionStorage.getItem(PEER_ID_KEY)
    if (existing) return existing
    const id = generatePeerId()
    sessionStorage.setItem(PEER_ID_KEY, id)
    return id
  } catch {
    return generatePeerId()
  }
}

function generatePeerId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Unique per join attempt — avoids deduping multiple tabs/devices behind one peerId. */
export function createSignalingGuestId(peerId: string): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${peerId}-${suffix}`
}
