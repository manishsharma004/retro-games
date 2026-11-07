import { unzipSync } from 'fflate'
import { detectSystem, getExtension } from './cores'

/** Extensions that also show up inside arcade ROM sets, so they do not mean "this zip is a console game". */
const GENERIC_EXTENSIONS = new Set(['.bin', '.rom', '.iso', '.img', '.dsk', '.dat', '.zip', '.7z'])

export function isWrappedConsoleName(fileName: string): boolean {
  const system = detectSystem(fileName)
  if (!system || system === 'arcade') return false
  return !GENERIC_EXTENSIONS.has(getExtension(fileName))
}

/** Read zip entry names from the central directory. Does not decompress the files. */
export async function listZipNames(file: Blob): Promise<string[]> {
  const tailSize = Math.min(file.size, 65557 + 22)
  const tail = new Uint8Array(await file.slice(file.size - tailSize).arrayBuffer())
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []

  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  const count = view.getUint16(eocd + 10, true)
  const cdSize = view.getUint32(eocd + 12, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) return []

  const cd = new Uint8Array(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer())
  const cdView = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
  const names: string[] = []
  let cursor = 0
  for (let n = 0; n < count && cursor + 46 <= cd.length; n += 1) {
    if (cdView.getUint32(cursor, true) !== 0x02014b50) break
    const nameLen = cdView.getUint16(cursor + 28, true)
    const extraLen = cdView.getUint16(cursor + 30, true)
    const commentLen = cdView.getUint16(cursor + 32, true)
    const name = new TextDecoder().decode(cd.subarray(cursor + 46, cursor + 46 + nameLen))
    if (name && !name.endsWith('/')) names.push(name)
    cursor += 46 + nameLen + extraLen + commentLen
  }
  return names
}

function baseName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

/**
 * Zips from ROM sites often wrap one console ROM. Those should load as that
 * system. Zips full of arcade chip files stay zips for MAME.
 */
export async function prepareRomFiles(files: File[]): Promise<File[]> {
  const prepared: File[] = []
  for (const file of files) {
    if (getExtension(file.name) !== '.zip') {
      prepared.push(file)
      continue
    }
    let names: string[] = []
    try {
      names = await listZipNames(file)
    } catch {
      prepared.push(file)
      continue
    }
    const wrapped = names.filter((name) => isWrappedConsoleName(baseName(name)))
    if (wrapped.length === 0) {
      prepared.push(file)
      continue
    }
    try {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
      const wanted = new Set(wrapped)
      const extracted: File[] = []
      for (const [path, bytes] of Object.entries(entries)) {
        if (!wanted.has(path)) continue
        const copy = new Uint8Array(bytes)
        extracted.push(new File([copy], baseName(path), { type: 'application/octet-stream' }))
      }
      prepared.push(...(extracted.length > 0 ? extracted : [file]))
    } catch {
      prepared.push(file)
    }
  }
  return prepared
}
