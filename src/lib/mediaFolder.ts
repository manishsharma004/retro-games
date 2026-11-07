import { classifyMediaName, type MediaKind } from './mediaKind'
import type { SystemId } from './cores'

export interface MediaEntry {
  id: string
  name: string
  relativePath: string
  kind: MediaKind
  system: SystemId | null
  file: File
}

const DB_NAME = 'retro-games/media'
const STORE = 'handles'
const HANDLE_KEY = 'folder'
const MAX_ENTRIES = 1500
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache'])

type DirectoryPicker = (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>

function picker(): DirectoryPicker | null {
  const candidate = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
  return typeof candidate === 'function' ? candidate : null
}

export function canPickMediaFolder(): boolean {
  return picker() !== null
}

export async function pickMediaFolder(): Promise<FileSystemDirectoryHandle> {
  const open = picker()
  if (!open) throw new Error('This browser cannot grant a folder. Choose files instead.')
  return open({ mode: 'read' })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the media folder store'))
  })
}

export async function saveMediaFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, HANDLE_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Could not remember that folder'))
  })
  db.close()
}

export async function loadMediaFolder(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb()
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(HANDLE_KEY)
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Could not read the saved folder'))
  })
  db.close()
  return handle
}

export async function forgetMediaFolder(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(HANDLE_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Could not forget that folder'))
  })
  db.close()
}

type PermittedDirectory = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>
}

export async function mediaFolderPermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  const permitted = handle as PermittedDirectory
  if (typeof permitted.queryPermission !== 'function') return 'granted'
  return permitted.queryPermission({ mode: 'read' })
}

export async function requestMediaFolderPermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  const permitted = handle as PermittedDirectory
  if (typeof permitted.requestPermission !== 'function') return 'granted'
  return permitted.requestPermission({ mode: 'read' })
}

export async function listMediaFolder(root: FileSystemDirectoryHandle): Promise<MediaEntry[]> {
  const entries: MediaEntry[] = []

  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    if (entries.length >= MAX_ENTRIES) return
    for await (const [name, handle] of dir.entries()) {
      if (entries.length >= MAX_ENTRIES) return
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue
      if (handle.kind === 'directory') {
        await walk(handle, `${prefix}${name}/`)
        continue
      }
      const classified = classifyMediaName(name)
      if (!classified) continue
      const fileHandle = handle as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const relativePath = `${prefix}${name}`
      entries.push({
        id: relativePath,
        name: name.replace(/\.[^.]+$/, ''),
        relativePath,
        kind: classified.kind,
        system: classified.system,
        file,
      })
    }
  }

  await walk(root, '')
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

export function filesFromInput(list: FileList | File[]): MediaEntry[] {
  const entries: MediaEntry[] = []
  for (const file of list) {
    const classified = classifyMediaName(file.name)
    if (!classified) continue
    const relativePath = file.webkitRelativePath || file.name
    entries.push({
      id: relativePath,
      name: file.name.replace(/\.[^.]+$/, ''),
      relativePath,
      kind: classified.kind,
      system: classified.system,
      file,
    })
    if (entries.length >= MAX_ENTRIES) break
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}
