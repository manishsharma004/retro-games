import { useCallback, useEffect, useState } from 'react'
import type { SystemId } from '../lib/cores'
import {
  addShelfRom,
  listShelf,
  regenerateShelfCover,
  removeShelfRom,
  setShelfCover,
  type ShelfSummary,
} from '../lib/romShelf'

export function useRomShelf() {
  const [entries, setEntries] = useState<ShelfSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setEntries(await listShelf())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the library')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const add = useCallback(
    async (files: File[], options: { system: SystemId; core: string }) => {
      const id = await addShelfRom(files, options)
      await reload()
      return id
    },
    [reload],
  )

  const remove = useCallback(
    async (id: string) => {
      await removeShelfRom(id)
      await reload()
    },
    [reload],
  )

  const useCover = useCallback(
    async (id: string, image: File) => {
      await setShelfCover(id, image)
      await reload()
    },
    [reload],
  )

  const regenerate = useCallback(
    async (id: string) => {
      await regenerateShelfCover(id)
      await reload()
    },
    [reload],
  )

  return { entries, error, add, remove, useCover, regenerate }
}
