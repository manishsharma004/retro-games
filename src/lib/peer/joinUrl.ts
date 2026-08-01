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

export function buildJoinUrl(code: string, mode: SessionMode): string {
  const normalized = normalizeRoomCode(code)
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const params = new URLSearchParams({ room: normalized, mode, join: '1' })
  return `${origin}${base}?${params.toString()}`
}

export function parseJoinLocation(search: string, hash: string): {
  room: string | null
  mode: SessionMode | null
} {
  const fromSearch = new URLSearchParams(search)
  let room = fromSearch.get('room')
  let mode = fromSearch.get('mode') as SessionMode | null

  if (!room && hash.startsWith('#join/')) {
    const parts = hash.slice(6).split('/')
    room = parts[0] ?? null
    mode = (parts[1] as SessionMode) ?? null
  }

  if (room) room = normalizeRoomCode(room)

  if (mode !== 'local' && mode !== 'remote' && mode !== 'coop') {
    mode = room ? 'local' : null
  }

  return { room, mode }
}
