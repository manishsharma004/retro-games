import { useCallback, useEffect, useRef, useState } from 'react'
import { Nostalgist } from 'nostalgist'
import { SYSTEMS, type SystemId, detectSystem } from '../lib/cores'
import {
  attachStageResizeSync,
  prepareResponsiveCanvas,
  readStageSize,
} from '../lib/canvasLock'
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

export interface UseEmulatorResult {
  status: EmulatorStatus
  error: string | null
  game: ActiveGame | null
  canvasRef: React.RefObject<HTMLCanvasElement | null>
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const nostalgistRef = useRef<Nostalgist | null>(null)
  const savedStateRef = useRef<Blob | null>(null)
  const gameRef = useRef<ActiveGame | null>(null)
  const settingsRef = useRef(settings)
  const resizeSyncCleanupRef = useRef<(() => void) | null>(null)
  const pressCountsRef = useRef(new Map<string, number>())
  const stateIoBusyRef = useRef(false)
  const [status, setStatus] = useState<EmulatorStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<ActiveGame | null>(null)
  const [pending, setPending] = useState<PendingLaunch | null>(null)
  const statusRef = useRef(status)

  settingsRef.current = settings
  statusRef.current = status

  const cleanup = useCallback(() => {
    resizeSyncCleanupRef.current?.()
    resizeSyncCleanupRef.current = null
    if (nostalgistRef.current) {
      try {
        nostalgistRef.current.exit({ removeCanvas: false })
      } catch {
        // already exited
      }
      nostalgistRef.current = null
    }
    pressCountsRef.current.clear()
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  useEffect(() => {
    if (!pending) return

    let cancelled = false

    const run = async () => {
      // Wait until the stage has real layout (player un-parks from landing view).
      let stage: HTMLElement | null = null
      for (let i = 0; i < 90; i++) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        if (cancelled) return
        const canvas = canvasRef.current
        stage = canvas?.parentElement ?? null
        if (stage && readStageSize(stage)) break
      }
      if (cancelled) return

      const canvas = canvasRef.current
      if (!canvas || !stage) {
        setError('Canvas is not ready')
        setStatus('error')
        setPending(null)
        return
      }

      const layout = readStageSize(stage)
      if (!layout) {
        setError('Game stage is not laid out yet')
        setStatus('error')
        setPending(null)
        return
      }

      cleanup()
      setError(null)
      setStatus('loading')
      setGame(pending.game)
      gameRef.current = pending.game

      try {
        const current = settingsRef.current
        const system = SYSTEMS[pending.game.system]

        prepareResponsiveCanvas(canvas)

        const nostalgist = await Nostalgist.launch({
          core: system.core,
          rom: pending.rom,
          state: pending.state,
          element: canvas,
          size: 'auto',
          style: {
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            position: 'static',
            display: 'block',
            imageRendering: current.videoSmooth ? 'auto' : 'pixelated',
          },
          shader: current.shader || undefined,
          cache: { core: true, shader: true },
          retroarchConfig: buildRetroarchConfig(current),
          retroarchCoreConfig: buildCoreConfig(pending.game.system, current),
        })

        if (cancelled) {
          nostalgist.exit({ removeCanvas: false })
          return
        }

        prepareResponsiveCanvas(canvas)
        resizeSyncCleanupRef.current?.()
        resizeSyncCleanupRef.current = attachStageResizeSync(nostalgist, stage)

        nostalgistRef.current = nostalgist
        if (pending.startPaused) {
          nostalgist.pause()
          setStatus('paused')
        } else {
          setStatus('running')
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to launch ROM')
          setStatus('error')
          cleanup()
        }
      } finally {
        if (!cancelled) setPending(null)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [pending, cleanup])

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
    nostalgistRef.current?.pause()
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    nostalgistRef.current?.resume()
    setStatus('running')
  }, [])

  const restart = useCallback(() => {
    nostalgistRef.current?.restart()
    setStatus('running')
  }, [])

  const toggleFastForward = useCallback(() => {
    nostalgistRef.current?.sendCommand('FAST_FORWARD')
  }, [])

  const saveState = useCallback(async () => {
    const emu = nostalgistRef.current
    if (!emu || stateIoBusyRef.current) return
    stateIoBusyRef.current = true
    const wasRunning = statusRef.current === 'running'
    try {
      if (wasRunning) emu.pause()
      const { state } = await emu.saveState()
      savedStateRef.current = state
    } finally {
      if (wasRunning && nostalgistRef.current === emu) {
        emu.resume()
        setStatus('running')
      }
      stateIoBusyRef.current = false
    }
  }, [])

  const loadState = useCallback(async () => {
    const emu = nostalgistRef.current
    if (!emu || !savedStateRef.current || stateIoBusyRef.current) return
    stateIoBusyRef.current = true
    const wasRunning = statusRef.current === 'running'
    try {
      if (wasRunning) emu.pause()
      await emu.loadState(savedStateRef.current)
    } finally {
      if (wasRunning && nostalgistRef.current === emu) {
        emu.resume()
        setStatus('running')
      }
      stateIoBusyRef.current = false
    }
  }, [])

  const exportStateBlob = useCallback(async () => {
    const emu = nostalgistRef.current
    if (!emu || stateIoBusyRef.current) return null
    stateIoBusyRef.current = true
    const wasRunning = statusRef.current === 'running'
    try {
      if (wasRunning) emu.pause()
      const { state } = await emu.saveState()
      return state
    } finally {
      if (wasRunning && nostalgistRef.current === emu) {
        emu.resume()
        setStatus('running')
      }
      stateIoBusyRef.current = false
    }
  }, [])

  const importStateBlob = useCallback(async (state: Blob) => {
    const emu = nostalgistRef.current
    if (!emu || stateIoBusyRef.current) return
    stateIoBusyRef.current = true
    const wasRunning = statusRef.current === 'running'
    try {
      if (wasRunning) emu.pause()
      await emu.loadState(state)
    } finally {
      if (wasRunning && nostalgistRef.current === emu) {
        emu.resume()
        setStatus('running')
      }
      stateIoBusyRef.current = false
    }
  }, [])

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
      if (next === 1) {
        if (player === 1) nostalgistRef.current?.pressDown(mapped)
        else nostalgistRef.current?.pressDown({ button: mapped, player })
      }
    },
    [mapButton],
  )

  const pressUp = useCallback(
    (button: string, player = 1) => {
      const mapped = mapButton(button)
      const key = pressKey(player, mapped)
      const next = Math.max(0, (pressCountsRef.current.get(key) ?? 0) - 1)
      pressCountsRef.current.set(key, next)
      if (next === 0) {
        if (player === 1) nostalgistRef.current?.pressUp(mapped)
        else nostalgistRef.current?.pressUp({ button: mapped, player })
      }
    },
    [mapButton],
  )

  const remotePressDown = useCallback(
    (button: string, player: number) => {
      const mapped = mapButton(button)
      if (player === 1) nostalgistRef.current?.pressDown(mapped)
      else nostalgistRef.current?.pressDown({ button: mapped, player })
    },
    [mapButton],
  )

  const remotePressUp = useCallback(
    (button: string, player: number) => {
      const mapped = mapButton(button)
      if (player === 1) nostalgistRef.current?.pressUp(mapped)
      else nostalgistRef.current?.pressUp({ button: mapped, player })
    },
    [mapButton],
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
    canvasRef,
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
