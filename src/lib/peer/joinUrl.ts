import type { SessionMode } from './protocol'

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(length = 4): string {
  let code = ''
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < length; i++) {
    code += ROOM_CHARS[bytes[i]! % ROOM_CHARS.length]
  }
  return code
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type JoinRole = 'player' | 'spectator'

export function buildJoinUrl(
  code: string,
  mode: SessionMode,
  opts?: {
    spectator?: boolean
    multiGuest?: boolean
    maxPlayers?: 2 | 3 | 4 | 5
    peerJsBrokerIndex?: number
  },
): string {
  const normalized = normalizeRoomCode(code)
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const params = new URLSearchParams({ room: normalized, mode, join: '1' })
  if (opts?.spectator) params.set('role', 'spectator')
  if (opts?.multiGuest) params.set('mg', '1')
  if (opts?.maxPlayers && opts.maxPlayers > 2) params.set('mp', String(opts.maxPlayers))
  if (opts?.peerJsBrokerIndex !== undefined) {
    params.set('pb', String(opts.peerJsBrokerIndex))
  }
  return `${origin}${base}?${params.toString()}`
}

function parseMaxPlayersParam(raw: string | null): 2 | 3 | 4 | 5 | undefined {
  const n = Number(raw)
  if (n === 2 || n === 3 || n === 4 || n === 5) return n
  return undefined
}

function parseBrokerIndexParam(raw: string | null): number | undefined {
  if (raw === null || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) return undefined
  return n
}

export function parseJoinLocation(search: string, hash: string): {
  room: string | null
  mode: SessionMode | null
  role: JoinRole
  multiGuest: boolean
  maxPlayers?: 2 | 3 | 4 | 5
  peerJsBrokerIndex?: number
} {
  const fromSearch = new URLSearchParams(search)
  let room = fromSearch.get('room')
  let mode = fromSearch.get('mode') as SessionMode | null
  const roleParam = fromSearch.get('role')
  let multiGuest = fromSearch.get('mg') === '1'
  let maxPlayers = parseMaxPlayersParam(fromSearch.get('mp'))
  const peerJsBrokerIndex = parseBrokerIndexParam(fromSearch.get('pb'))

  if (!room && hash.startsWith('#join/')) {
    const parts = hash.slice(6).split('/')
    room = parts[0] ?? null
    mode = (parts[1] as SessionMode) ?? null
  }

  if (room) room = normalizeRoomCode(room)

  if (mode !== 'local' && mode !== 'remote' && mode !== 'coop') {
    mode = room ? 'local' : null
  }

  const role: JoinRole = roleParam === 'spectator' ? 'spectator' : 'player'

  return { room, mode, role, multiGuest, maxPlayers, peerJsBrokerIndex }
}
