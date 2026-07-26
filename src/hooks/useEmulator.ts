import { useCallback, useEffect, useRef, useState } from 'react'
import { Nostalgist } from 'nostalgist'
import { SYSTEMS, type SystemId, detectSystem } from '../lib/cores'
import {
  CANVAS_BUFFER_HEIGHT,
  CANVAS_BUFFER_WIDTH,
  installCanvasResizeObserverGuard,
  lockEmulatorCanvas,
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
  /** Capture current save-state Blob for peer wire (does not update local slot). */
  exportStateBlob: () => Promise<Blob | null>
  /** Apply a remote save-state Blob (peer resync). */
  importStateBlob: (state: Blob) => Promise<void>
  /** Read ROM bytes for the active game (file-backed launches only). */
  getRomBytes: () => Promise<Uint8Array | null>
  pressDown: (button: string, player?: number) => void
  pressUp: (button: string, player?: number) => void
  /** Inject remote seat presses without touching local ref-counts. */
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
  const canvasStabilizeCleanupRef = useRef<(() => void) | null>(null)
  // Ref-count presses so keyboard + on-screen pad can share a button.
  // Keys are `${player}:${button}` so local seats stay independent.
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
    canvasStabilizeCleanupRef.current?.()
    canvasStabilizeCleanupRef.current = null
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
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      if (cancelled) return

      const canvas = canvasRef.current
      if (!canvas) {
        setError('Canvas is not ready')
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
        const stage = canvas.parentElement

        // Must install before launch — RA attaches ResizeObserver during init.
        const removeRoGuard = installCanvasResizeObserverGuard(canvas)

        const nostalgist = await Nostalgist.launch({
          core: system.core,
          rom: pending.rom,
          state: pending.state,
          element: canvas,
          size: { width: CANVAS_BUFFER_WIDTH, height: CANVAS_BUFFER_HEIGHT },
          style: {
            // Fixed CSS px (not 100%) so RO contentRect stays at buffer size.
            width: `${CANVAS_BUFFER_WIDTH}px`,
            height: `${CANVAS_BUFFER_HEIGHT}px`,
            backgroundColor: '#000',
            position: 'absolute',
            left: '50%',
            top: '50%',
            display: 'block',
            imageRendering: current.videoSmooth ? 'auto' : 'pixelated',
          },
          shader: current.shader || undefined,
          cache: { core: true, shader: true },
          retroarchConfig: buildRetroarchConfig(current),
          retroarchCoreConfig: buildCoreConfig(pending.game.system, current),
        })

        if (cancelled) {
          removeRoGuard()
          nostalgist.exit({ removeCanvas: false })
          return
        }

        canvasStabilizeCleanupRef.current?.()
        const unlock = stage
          ? lockEmulatorCanvas(
              nostalgist,
              canvas,
              stage,
              CANVAS_BUFFER_WIDTH,
              CANVAS_BUFFER_HEIGHT,
            )
          : () => {}
        canvasStabilizeCleanupRef.current = () => {
          unlock()
          removeRoGuard()
        }

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

  // Remote presses bypass local ref-count so a remote release cannot cancel a local hold.
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
    if (active.source === 'demo') {
      launchDemo()
    } else if (active.file) {
      launchFile(active.file)
    }
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
