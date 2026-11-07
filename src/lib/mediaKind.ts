import { detectSystem, getExtension, type SystemId } from './cores'

const AUDIO = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.opus'])
const VIDEO = new Set(['.mp4', '.webm', '.ogv', '.mov', '.m4v'])
const PHOTO = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'])

/** Extensions that belong to more than one system, so a media folder should not treat them as games. */
const AMBIGUOUS_ROM = new Set(['.bin', '.rom', '.iso', '.img', '.dsk', '.dat'])

export type MediaKind = 'game' | 'music' | 'video' | 'photo'

export interface ClassifiedName {
  kind: MediaKind
  system: SystemId | null
}

/** Decide how a file in a user folder should appear in the library. */
export function classifyMediaName(fileName: string): ClassifiedName | null {
  const ext = getExtension(fileName)
  if (AUDIO.has(ext)) return { kind: 'music', system: null }
  if (VIDEO.has(ext)) return { kind: 'video', system: null }
  if (PHOTO.has(ext)) return { kind: 'photo', system: null }
  if (!ext || AMBIGUOUS_ROM.has(ext)) return null
  const system = detectSystem(fileName)
  if (!system) return null
  return { kind: 'game', system }
}
