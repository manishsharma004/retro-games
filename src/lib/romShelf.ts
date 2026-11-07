import { SYSTEMS, type SystemId } from './cores'
import { renderCover, shelfTitle } from './coverArt'

const DB_NAME = 'retro-games'
const STORE = 'shelf'
const VERSION = 1

export interface ShelfFile {
  name: string
  type: string
  blob: Blob
}

export interface ShelfRom {
  id: string
  title: string
  system: SystemId
  core: string
  addedAt: number
  fileNames: string[]
  files: ShelfFile[]
  cover: Blob
  coverKind: 'generated' | 'custom'
}

export type ShelfSummary = Omit<ShelfRom, 'files'>

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the library'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Library request failed'))
  })
}

async function putRom(rom: ShelfRom): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(rom)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the ROM'))
    })
  } finally {
    db.close()
  }
}

export async function listShelf(): Promise<ShelfSummary[]> {
  const db = await openDb()
  try {
    const records = await requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<ShelfRom[]>)
    return records
      .filter((rom) => rom && typeof rom.id === 'string' && rom.cover instanceof Blob)
      .map(({ files: _files, ...summary }) => summary)
      .sort((a, b) => b.addedAt - a.addedAt)
  } finally {
    db.close()
  }
}

export async function readShelfFiles(id: string): Promise<File[]> {
  const db = await openDb()
  try {
    const rom = await requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<ShelfRom | undefined>)
    if (!rom) throw new Error('That game is no longer in the library')
    return rom.files.map((file) => new File([file.blob], file.name, { type: file.type || 'application/octet-stream' }))
  } finally {
    db.close()
  }
}

export async function addShelfRom(
  files: File[],
  options: { system: SystemId; core: string; title?: string },
): Promise<string> {
  if (files.length === 0) throw new Error('Choose a ROM first')
  const title = options.title?.trim() || shelfTitle(files[0].name)
  const cover = await renderCover(title, options.system)
  const rom: ShelfRom = {
    id: crypto.randomUUID(),
    title,
    system: options.system,
    core: options.core,
    addedAt: Date.now(),
    fileNames: files.map((file) => file.name),
    files: files.map((file) => ({ name: file.name, type: file.type, blob: file })),
    cover,
    coverKind: 'generated',
  }
  await putRom(rom)
  return rom.id
}

export async function removeShelfRom(id: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not remove the ROM'))
    })
  } finally {
    db.close()
  }
}

export async function setShelfCover(id: string, image: File): Promise<void> {
  const db = await openDb()
  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE)
    const rom = await requestToPromise(store.get(id) as IDBRequest<ShelfRom | undefined>)
    if (!rom) throw new Error('That game is no longer in the library')
    const bitmap = await createImageBitmap(image)
    try {
      rom.cover = await renderCover(rom.title, rom.system, bitmap)
    } finally {
      bitmap.close()
    }
    rom.coverKind = 'custom'
    await putRom(rom)
  } finally {
    db.close()
  }
}

export async function regenerateShelfCover(id: string): Promise<void> {
  const db = await openDb()
  try {
    const rom = await requestToPromise(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<ShelfRom | undefined>,
    )
    if (!rom) throw new Error('That game is no longer in the library')
    rom.cover = await renderCover(rom.title, rom.system)
    rom.coverKind = 'generated'
    await putRom(rom)
  } finally {
    db.close()
  }
}

export function systemLabel(system: SystemId): string {
  return SYSTEMS[system].label
}
