import { useCallback, useEffect, useRef, useState } from 'react'
import { Nostalgist } from 'nostalgist'
import { SYSTEMS, type SystemId, detectSystem } from '../lib/cores'
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
  source: 'file' | 'demo' | 'library'
  file?: File
}

interface PendingLaunch {
  game: ActiveGame
  rom: File | string
}

export interface UseEmulatorResult {
  status: EmulatorStatus
  error: string | null
  game: ActiveGame | null
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  launchFile: (file: File) => void
  launchDemo: () => void
  launchLibrary: (entry: LibraryRom) => void
  exit: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  toggleFastForward: () => void
  saveState: () => Promise<void>
  loadState: () => Promise<void>
  pressDown: (button: string) => void
  pressUp: (button: string) => void
  relaunchWithSettings: () => void
}

export function useEmulator(settings: EmulatorSettings): UseEmulatorResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const nostalgistRef = useRef<Nostalgist | null>(null)
  const savedStateRef = useRef<Blob | null>(null)
  const gameRef = useRef<ActiveGame | null>(null)
  const settingsRef = useRef(settings)
  // Ref-count presses so keyboard + on-screen pad can share a button.
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
      // Wait for React to paint the play shell at full size
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

        const nostalgist = await Nostalgist.launch({
          core: system.core,
          rom: pending.rom,
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

        nostalgistRef.current = nostalgist
        setStatus('running')
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
    // Pause so RetroArch is not also simulating while the main thread blocks
    // on SAVE_STATE (Emscripten has no real worker threads for this).
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

  const mapButton = useCallback((button: string) => {
    if (!settingsRef.current.swapAB) return button
    if (button === 'a') return 'b'
    if (button === 'b') return 'a'
    if (button === 'x') return 'y'
    if (button === 'y') return 'x'
    return button
  }, [])

  // Ref-count presses so keyboard + on-screen pad can hold the same button
  // without one side's release canceling the other.
  const pressDown = useCallback(
    (button: string) => {
      const mapped = mapButton(button)
      const next = (pressCountsRef.current.get(mapped) ?? 0) + 1
      pressCountsRef.current.set(mapped, next)
      if (next === 1) nostalgistRef.current?.pressDown(mapped)
    },
    [mapButton],
  )

  const pressUp = useCallback(
    (button: string) => {
      const mapped = mapButton(button)
      const next = Math.max(0, (pressCountsRef.current.get(mapped) ?? 0) - 1)
      pressCountsRef.current.set(mapped, next)
      if (next === 0) nostalgistRef.current?.pressUp(mapped)
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
    exit,
    pause,
    resume,
    restart,
    toggleFastForward,
    saveState,
    loadState,
    pressDown,
    pressUp,
    relaunchWithSettings,
  }
}
