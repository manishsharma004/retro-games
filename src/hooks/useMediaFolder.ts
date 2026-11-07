import { useCallback, useEffect, useState } from 'react'
import {
  canPickMediaFolder,
  filesFromInput,
  forgetMediaFolder,
  listMediaFolder,
  loadMediaFolder,
  mediaFolderPermission,
  pickMediaFolder,
  requestMediaFolderPermission,
  saveMediaFolder,
  type MediaEntry,
} from '../lib/mediaFolder'

export function useMediaFolder() {
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [folderName, setFolderName] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const scan = useCallback(async (next: FileSystemDirectoryHandle) => {
    setScanning(true)
    setError(null)
    try {
      const found = await listMediaFolder(next)
      setEntries(found)
      setFolderName(next.name)
      setHandle(next)
      setNeedsPermission(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that folder')
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const saved = await loadMediaFolder()
        if (!saved || cancelled) return
        setHandle(saved)
        setFolderName(saved.name)
        const permission = await mediaFolderPermission(saved)
        if (cancelled) return
        if (permission === 'granted') await scan(saved)
        else setNeedsPermission(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not restore the folder')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scan])

  const pick = useCallback(async () => {
    setError(null)
    try {
      const next = await pickMediaFolder()
      await saveMediaFolder(next)
      await scan(next)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Could not open that folder')
    }
  }, [scan])

  const resume = useCallback(async () => {
    if (!handle) return
    setError(null)
    try {
      const permission = await requestMediaFolderPermission(handle)
      if (permission !== 'granted') {
        setNeedsPermission(true)
        setError('Folder access was not granted')
        return
      }
      await scan(handle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resume that folder')
    }
  }, [handle, scan])

  const forget = useCallback(async () => {
    await forgetMediaFolder()
    setHandle(null)
    setFolderName(null)
    setEntries([])
    setNeedsPermission(false)
    setError(null)
  }, [])

  const adoptFiles = useCallback((list: FileList | File[]) => {
    setEntries(filesFromInput(list))
    setFolderName('Chosen folder')
    setNeedsPermission(false)
    setError(null)
  }, [])

  return {
    entries,
    folderName,
    scanning,
    error,
    needsPermission,
    canPick: canPickMediaFolder(),
    pick,
    resume,
    forget,
    adoptFiles,
  }
}
