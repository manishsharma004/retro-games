import { useCallback, useEffect, useRef, useState } from 'react'
import { SYSTEMS, type SystemId, detectSystem } from '../lib/cores'
import { lockEmulatorStage } from '../lib/canvasLock'
import { romUrl, type LibraryRom } from '../lib/library'
import {
  buildCoreConfig,
  buildRetroarchConfig,
  type EmulatorSettings,
} from '../lib/settings'

export type EmulatorStatus = 'idle' | 'loading' | 'running' | 'paused' | 'error'

export interface ActiveGame {
  name: string
  system: SystemId
  core: string
  source: 'file' | 'demo' | 'library' | 'peer'
  file?: File
  libraryFile?: string
}

interface PendingLaunch {
  game: ActiveGame
  rom: File | string
  state?: Blob
  startPaused?: boolean
}

type FrameToParent =
  | { type: 'ready' }
  | { type: 'status'; status: string; error?: string }
  | { type: 'save-state-response'; id: number; state?: ArrayBuffer; error?: string }

export interface UseEmulatorResult {
  status: EmulatorStatus
  error: string | null
  game: ActiveGame | null
  frameRef: React.RefObject<HTMLIFrameElement | null>
  hostRef: React.RefObject<HTMLDivElement | null>
  stageRef: React.RefObject<HTMLDivElement | null>
  launchFile: (file: File) => void
  launchDemo: () => void
  launchLibrary: (entry: LibraryRom) => void
  launchPeer: (opts: {
    name: string
    system: SystemId
    rom: Blob
    fileName: string
    state: Blob
    startPaused?: boolean
  }) => void
  exit: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  toggleFastForward: () => void
  saveState: () => Promise<void>
  loadState: () => Promise<void>
  exportStateBlob: () => Promise<Blob | null>
  importStateBlob: (state: Blob) => Promise<void>
  getRomBytes: () => Promise<Uint8Array | null>
  pressDown: (button: string, player?: number) => void
  pressUp: (button: string, player?: number) => void
  remotePressDown: (button: string, player: number) => void
  remotePressUp: (button: string, player: number) => void
  relaunchWithSettings: () => void
}

function pressKey(player: number, button: string): string {
  return `${player}:${button}`
}

export function useEmulator(settings: EmulatorSettings): UseEmulatorResult {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const frameReadyRef = useRef(false)
  const savedStateRef = useRef<Blob | null>(null)
  const gameRef = useRef<ActiveGame | null>(null)
  const settingsRef = useRef(settings)
  const stageScaleCleanupRef = useRef<(() => void) | null>(null)
  const pressCountsRef = useRef(new Map<string, number>())
  const stateIoBusyRef = useRef(false)
  const saveWaitersRef = useRef(
    new Map<number, { resolve: (b: Blob | null) => void; reject: (e: Error) => void }>(),
  )
  const saveIdRef = useRef(1)
  const [status, setStatus] = useState<EmulatorStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<ActiveGame | null>(null)
  const [pending, setPending] = useState<PendingLaunch | null>(null)
  const statusRef = useRef(status)

  settingsRef.current = settings
  statusRef.current = status

  const postToFrame = useCallback((msg: Record<string, unknown>) => {
    const win = frameRef.current?.contentWindow
    if (!win) return false
    win.postMessage(msg, '*')
    return true
  }, [])

  const cleanup = useCallback(() => {
    stageScaleCleanupRef.current?.()
    stageScaleCleanupRef.current = null
    postToFrame({ type: 'exit' })
    pressCountsRef.current.clear()
  }, [postToFrame])

  useEffect(() => () => cleanup(), [cleanup])

  // Listen for iframe → parent messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (frameRef.current && event.source !== frameRef.current.contentWindow) return
      const data = event.data as FrameToParent
      if (!data || typeof data !== 'object' || !('type' in data)) return

      if (data.type === 'ready') {
        frameReadyRef.current = true
      } else if (data.type === 'status') {
        if (data.status === 'running' || data.status === 'paused' || data.status === 'loading') {
          setStatus(data.status)
        } else if (data.status === 'error') {
          setStatus('error')
          setError(data.error ?? 'Emulator error')
        } else if (data.status === 'idle') {
          // ignore — parent owns idle via exit()
        }
      } else if (data.type === 'save-state-response') {
        const waiter = saveWaitersRef.current.get(data.id)
        if (!waiter) return
        saveWaitersRef.current.delete(data.id)
        if (data.error) waiter.reject(new Error(data.error))
        else waiter.resolve(data.state ? new Blob([data.state]) : null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Scale stage once the player is shown.
  useEffect(() => {
    if (status === 'idle' || status === 'error') return
    const host = hostRef.current
    const stage = stageRef.current
    if (!host || !stage) return
    stageScaleCleanupRef.current?.()
    stageScaleCleanupRef.current = lockEmulatorStage(stage, host)
    return () => {
      stageScaleCleanupRef.current?.()
      stageScaleCleanupRef.current = null
    }
  }, [status, game])

  useEffect(() => {
    if (!pending) return

    let cancelled = false

    const run = async () => {
      setError(null)
      setStatus('loading')
      setGame(pending.game)
      gameRef.current = pending.game

      // Wait for iframe bridge.
      for (let i = 0; i < 120 && !frameReadyRef.current; i++) {
        await new Promise<void>((r) => setTimeout(r, 50))
        if (cancelled) return
      }
      if (!frameReadyRef.current) {
        setError('Emulator frame failed to load')
        setStatus('error')
        setPending(null)
        return
      }

      let romFile: File
      if (typeof pending.rom === 'string') {
        const res = await fetch(romUrl(pending.rom))
        if (!res.ok) throw new Error(`Could not load ${pending.rom}`)
        romFile = new File([await res.blob()], pending.rom, {
          type: 'application/octet-stream',
        })
      } else {
        romFile = pending.rom
      }
      if (cancelled) return

      const romBuf = await romFile.arrayBuffer()
      const stateBuf = pending.state ? await pending.state.arrayBuffer() : undefined
      if (cancelled) return

      const current = settingsRef.current
      postToFrame({
        type: 'launch',
        core: SYSTEMS[pending.game.system].core,
        rom: romBuf,
        romName: romFile.name,
        state: stateBuf,
        startPaused: pending.startPaused,
        shader: current.shader || undefined,
        videoSmooth: current.videoSmooth,
        retroarchConfig: buildRetroarchConfig(current),
        retroarchCoreConfig: buildCoreConfig(pending.game.system, current),
      })
    }

    void run().catch((err) => {
      if (!cancelled) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to launch ROM')
        setStatus('error')
      }
    }).finally(() => {
      if (!cancelled) setPending(null)
    })

    return () => {
      cancelled = true
    }
  }, [pending, postToFrame])

  const queueLaunch = useCallback((next: PendingLaunch) => {
    setError(null)
    setStatus('loading')
    setGame(next.game)
    gameRef.current = next.game
    setPending(next)
  }, [])

  const launchFile = useCallback(
    (file: File) => {
      const system = detectSystem(file.name)
      if (!system) {
        setError('Unsupported ROM. Use NES (.nes) or SNES (.sfc, .smc) files.')
        setStatus('error')
        return
      }
      queueLaunch({
        game: {
          name: file.name,
          system,
          core: SYSTEMS[system].core,
          source: 'file',
          file,
        },
        rom: file,
      })
    },
    [queueLaunch],
  )

  const launchDemo = useCallback(() => {
    queueLaunch({
      game: {
        name: 'flappybird.nes (demo)',
        system: 'nes',
        core: SYSTEMS.nes.core,
        source: 'demo',
      },
      rom: 'flappybird.nes',
    })
  }, [queueLaunch])

  const launchLibrary = useCallback(
    (entry: LibraryRom) => {
      const game: ActiveGame = {
        name: entry.name,
        system: entry.system,
        core: SYSTEMS[entry.system].core,
        source: 'library',
        libraryFile: entry.file,
      }
      setError(null)
      setStatus('loading')
      setGame(game)
      gameRef.current = game

      void (async () => {
        try {
          const res = await fetch(romUrl(entry.file))
          if (!res.ok) {
            throw new Error(`Could not load ${entry.file} (HTTP ${res.status})`)
          }
          const blob = await res.blob()
          const file = new File([blob], entry.file, { type: 'application/octet-stream' })
          queueLaunch({ game: { ...game, file }, rom: file })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load ROM')
          setStatus('error')
        }
      })()
    },
    [queueLaunch],
  )

  const launchPeer = useCallback(
    (opts: {
      name: string
      system: SystemId
      rom: Blob
      fileName: string
      state: Blob
      startPaused?: boolean
    }) => {
      const file = new File([opts.rom], opts.fileName, { type: 'application/octet-stream' })
      queueLaunch({
        game: {
          name: opts.name,
          system: opts.system,
          core: SYSTEMS[opts.system].core,
          source: 'peer',
          file,
        },
        rom: file,
        state: opts.state,
        startPaused: opts.startPaused ?? true,
      })
    },
    [queueLaunch],
  )

  const exit = useCallback(() => {
    setPending(null)
    cleanup()
    setGame(null)
    gameRef.current = null
    setStatus('idle')
    setError(null)
  }, [cleanup])

  const pause = useCallback(() => {
    postToFrame({ type: 'pause' })
    setStatus('paused')
  }, [postToFrame])

  const resume = useCallback(() => {
    postToFrame({ type: 'resume' })
    setStatus('running')
  }, [postToFrame])

  const restart = useCallback(() => {
    postToFrame({ type: 'restart' })
    setStatus('running')
  }, [postToFrame])

  const toggleFastForward = useCallback(() => {
    postToFrame({ type: 'fastforward' })
  }, [postToFrame])

  const requestSaveState = useCallback(async () => {
    if (stateIoBusyRef.current) return null
    stateIoBusyRef.current = true
    const id = saveIdRef.current++
    try {
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        saveWaitersRef.current.set(id, { resolve, reject })
        if (!postToFrame({ type: 'save-state-request', id })) {
          saveWaitersRef.current.delete(id)
          resolve(null)
        }
        window.setTimeout(() => {
          if (saveWaitersRef.current.has(id)) {
            saveWaitersRef.current.delete(id)
            reject(new Error('Save state timed out'))
          }
        }, 15000)
      })
      return blob
    } finally {
      stateIoBusyRef.current = false
    }
  }, [postToFrame])

  const saveState = useCallback(async () => {
    const blob = await requestSaveState()
    if (blob) savedStateRef.current = blob
  }, [requestSaveState])

  const loadState = useCallback(async () => {
    if (!savedStateRef.current || stateIoBusyRef.current) return
    stateIoBusyRef.current = true
    try {
      const buf = await savedStateRef.current.arrayBuffer()
      postToFrame({ type: 'load-state', state: buf })
    } finally {
      stateIoBusyRef.current = false
    }
  }, [postToFrame])

  const exportStateBlob = useCallback(async () => {
    return requestSaveState()
  }, [requestSaveState])

  const importStateBlob = useCallback(
    async (state: Blob) => {
      if (stateIoBusyRef.current) return
      stateIoBusyRef.current = true
      try {
        const buf = await state.arrayBuffer()
        postToFrame({ type: 'load-state', state: buf })
      } finally {
        stateIoBusyRef.current = false
      }
    },
    [postToFrame],
  )

  const getRomBytes = useCallback(async () => {
    const active = gameRef.current
    if (!active?.file) return null
    const buf = await active.file.arrayBuffer()
    return new Uint8Array(buf)
  }, [])

  const mapButton = useCallback((button: string) => {
    if (!settingsRef.current.swapAB) return button
    if (button === 'a') return 'b'
    if (button === 'b') return 'a'
    if (button === 'x') return 'y'
    if (button === 'y') return 'x'
    return button
  }, [])

  const pressDown = useCallback(
    (button: string, player = 1) => {
      const mapped = mapButton(button)
      const key = pressKey(player, mapped)
      const next = (pressCountsRef.current.get(key) ?? 0) + 1
      pressCountsRef.current.set(key, next)
      if (next === 1) postToFrame({ type: 'press', button: mapped, player })
    },
    [mapButton, postToFrame],
  )

  const pressUp = useCallback(
    (button: string, player = 1) => {
      const mapped = mapButton(button)
      const key = pressKey(player, mapped)
      const next = Math.max(0, (pressCountsRef.current.get(key) ?? 0) - 1)
      pressCountsRef.current.set(key, next)
      if (next === 0) postToFrame({ type: 'release', button: mapped, player })
    },
    [mapButton, postToFrame],
  )

  const remotePressDown = useCallback(
    (button: string, player: number) => {
      const mapped = mapButton(button)
      postToFrame({ type: 'press', button: mapped, player })
    },
    [mapButton, postToFrame],
  )

  const remotePressUp = useCallback(
    (button: string, player: number) => {
      const mapped = mapButton(button)
      postToFrame({ type: 'release', button: mapped, player })
    },
    [mapButton, postToFrame],
  )

  const relaunchWithSettings = useCallback(() => {
    const active = gameRef.current
    if (!active) return
    if (active.source === 'demo') launchDemo()
    else if (active.file) launchFile(active.file)
  }, [launchDemo, launchFile])

  return {
    status,
    error,
    game,
    frameRef,
    hostRef,
    stageRef,
    launchFile,
    launchDemo,
    launchLibrary,
    launchPeer,
    exit,
    pause,
    resume,
    restart,
    toggleFastForward,
    saveState,
    loadState,
    exportStateBlob,
    importStateBlob,
    getRomBytes,
    pressDown,
    pressUp,
    remotePressDown,
    remotePressUp,
    relaunchWithSettings,
  }
}
