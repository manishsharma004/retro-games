import type { SystemId } from '../cores'
import type { EmulatorSettings } from '../settings'

export type PeerSeat = 1 | 2

export type PeerRole = 'host' | 'guest'

export interface PeerSyncSettings {
  swapAB: boolean
  allowOpposingDirections: boolean
  nesRegion: EmulatorSettings['nesRegion']
  nesTurbo: EmulatorSettings['nesTurbo']
  snesRegion: EmulatorSettings['snesRegion']
  frameSkip: number
  rewindEnable: boolean
}

export function pickSyncSettings(settings: EmulatorSettings): PeerSyncSettings {
  return {
    swapAB: settings.swapAB,
    allowOpposingDirections: settings.allowOpposingDirections,
    nesRegion: settings.nesRegion,
    nesTurbo: settings.nesTurbo,
    snesRegion: settings.snesRegion,
    frameSkip: settings.frameSkip,
    rewindEnable: settings.rewindEnable,
  }
}

export type ControlMessage =
  | { type: 'hello'; role: PeerRole; seat: PeerSeat }
  | { type: 'ready' }
  | { type: 'go'; at: number }
  | {
      type: 'bootstrap'
      name: string
      system: SystemId
      core: string
      romSize: number
      libraryFile?: string
      settings: PeerSyncSettings
      stateSize: number
    }
  | { type: 'transfer-start'; id: number; kind: 'rom' | 'state'; size: number }
  | { type: 'transfer-end'; id: number; kind: 'rom' | 'state' }
  | { type: 'input'; seat: PeerSeat; button: string; down: boolean; t: number }
  | { type: 'resync-request' }
  | { type: 'ping'; t: number }
  | { type: 'pong'; t: number }

/** Binary chunk header: magic(2) + type(1) + id(2) + index(2) + count(2) = 9 bytes */
export const CHUNK_HEADER_SIZE = 9
export const CHUNK_MAGIC0 = 0x52 // R
export const CHUNK_MAGIC1 = 0x47 // G
export const CHUNK_TYPE = 1
export const CHUNK_PAYLOAD_SIZE = 16 * 1024

export function encodeChunk(
  id: number,
  index: number,
  count: number,
  payload: Uint8Array,
): ArrayBuffer {
  const buf = new ArrayBuffer(CHUNK_HEADER_SIZE + payload.byteLength)
  const view = new DataView(buf)
  view.setUint8(0, CHUNK_MAGIC0)
  view.setUint8(1, CHUNK_MAGIC1)
  view.setUint8(2, CHUNK_TYPE)
  view.setUint16(3, id, false)
  view.setUint16(5, index, false)
  view.setUint16(7, count, false)
  new Uint8Array(buf, CHUNK_HEADER_SIZE).set(payload)
  return buf
}

export function decodeChunk(data: ArrayBuffer): {
  id: number
  index: number
  count: number
  payload: Uint8Array
} | null {
  if (data.byteLength < CHUNK_HEADER_SIZE) return null
  const view = new DataView(data)
  if (view.getUint8(0) !== CHUNK_MAGIC0 || view.getUint8(1) !== CHUNK_MAGIC1) return null
  if (view.getUint8(2) !== CHUNK_TYPE) return null
  return {
    id: view.getUint16(3, false),
    index: view.getUint16(5, false),
    count: view.getUint16(7, false),
    payload: new Uint8Array(data, CHUNK_HEADER_SIZE),
  }
}

export function isControlMessage(value: unknown): value is ControlMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value)
}
