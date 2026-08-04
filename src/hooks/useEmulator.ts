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
  /** Locked 60 Hz audio-sync timing for dual-emulator co-op. */
  coopMode?: boolean
}

interface PendingLaunch {
  game: ActiveGame
  rom: File | string
  state?: Blob
  startPaused?: boolean
}

function isCoopLaunch(game: ActiveGame): boolean {
  return Boolean(game.coopMode || game.source === 'peer')
}

export interface UseEmulatorResult {
  status: EmulatorStatus
  error: string | null
  game: ActiveGame | null
  /** Bumps after each successful ROM launch (running/paused). */
  launchGeneration: number
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
  exportStateBlob: (options?: { keepPaused?: boolean }) => Promise<Blob | null>
  importStateBlob: (state: Blob, options?: { keepPaused?: boolean }) => Promise<void>
  getRomBytes: () => Promise<Uint8Array | null>
  /** Resume after a state load; re-issues resume if the core stays paused. */
  resumeAfterStateLoad: () => void
  pressDown: (button: string, player?: number) => void
  pressUp: (button: string, player?: number) => void
  remotePressDown: (button: string, player: number) => void
  remotePressUp: (button: string, player: number) => void
  releaseAllInputs: () => void
  isRunning: () => boolean
  relaunchWithSettings: () => void
  /** Relaunch with co-op timing config (host, before sharing ROM). */
  applyCoopTiming: () => Promise<void>
  getNostalgist: () => Nostalgist | null
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
  const [launchGeneration, setLaunchGeneration] = useState(0)
  const [pending, setPending] = useState<PendingLaunch | null>(null)
  const statusRef = useRef(status)
  const launchWaiterRef = useRef<{
    resolve: () => void
    reject: (err: Error) => void
  } | null>(null)

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
        const coop = isCoopLaunch(pending.game)

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
          retroarchConfig: buildRetroarchConfig(current, { coop, system: pending.game.system }),
          retroarchCoreConfig: buildCoreConfig(pending.game.system, current, { coop }),
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
        setLaunchGeneration((n) => n + 1)
        launchWaiterRef.current?.resolve()
        launchWaiterRef.current = null
      } catch (err) {
        console.error(err)
        const message = err instanceof Error ? err.message : 'Failed to launch ROM'
        launchWaiterRef.current?.reject(new Error(message))
        launchWaiterRef.current = null
        if (!cancelled) {
          setError(message)
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
          coopMode: true,
        },
        rom: file,
        state: opts.state,
        startPaused: opts.startPaused ?? true,
      })
    },
    [queueLaunch],
  )

  const mapButton = useCallback((button: string) => {
    if (!settingsRef.current.swapAB) return button
    if (button === 'a') return 'b'
    if (button === 'b') return 'a'
    if (button === 'x') return 'y'
    if (button === 'y') return 'x'
    return button
  }, [])

  const sendPressUp = useCallback(
    (emu: Nostalgist, button: string, player: number) => {
      const mapped = mapButton(button)
      if (player === 1) emu.pressUp(mapped)
      else emu.pressUp({ button: mapped, player })
    },
    [mapButton],
  )

  const releaseAllInputs = useCallback(() => {
    const emu = nostalgistRef.current
    const held = [...pressCountsRef.current.entries()]
    pressCountsRef.current.clear()
    if (!emu) return
    for (const [key, count] of held) {
      if (count <= 0) continue
      const colon = key.indexOf(':')
      const player = Number(key.slice(0, colon))
      const button = key.slice(colon + 1)
      sendPressUp(emu, button, player)
    }
  }, [sendPressUp])

  const isRunning = useCallback(() => statusRef.current === 'running', [])

  const exit = useCallback(() => {
    setPending(null)
    cleanup()
    setGame(null)
    gameRef.current = null
    setStatus('idle')
    setError(null)
  }, [cleanup])

  const pause = useCallback(() => {
    releaseAllInputs()
    nostalgistRef.current?.pause()
    setStatus('paused')
  }, [releaseAllInputs])

  const resume = useCallback(() => {
    releaseAllInputs()
    nostalgistRef.current?.resume()
    setStatus('running')
  }, [releaseAllInputs])

  const resumeAfterStateLoad = useCallback(() => {
    releaseAllInputs()
    const emu = nostalgistRef.current
    if (!emu) return
    emu.resume()
    setStatus('running')
    requestAnimationFrame(() => {
      const active = nostalgistRef.current
      if (!active) return
      if (active.getStatus() !== 'running') {
        active.resume()
        setStatus('running')
      }
    })
  }, [releaseAllInputs])

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

  const exportStateBlob = useCallback(async (options?: { keepPaused?: boolean }) => {
    const emu = nostalgistRef.current
    if (!emu || stateIoBusyRef.current) return null
    stateIoBusyRef.current = true
    const wasRunning = statusRef.current === 'running'
    try {
      releaseAllInputs()
      if (wasRunning) emu.pause()
      const { state } = await emu.saveState()
      return state
    } finally {
      if (wasRunning && !options?.keepPaused && nostalgistRef.current === emu) {
        emu.resume()
        setStatus('running')
      }
      stateIoBusyRef.current = false
    }
  }, [releaseAllInputs])

  const importStateBlob = useCallback(async (state: Blob, options?: { keepPaused?: boolean }) => {
    const emu = nostalgistRef.current
    if (!emu) return

    for (let i = 0; i < 80 && stateIoBusyRef.current; i++) {
      await new Promise<void>((r) => window.setTimeout(r, 16))
    }
    if (stateIoBusyRef.current) {
      throw new Error('Emulator busy during state import')
    }

    stateIoBusyRef.current = true
    const wasRunning = statusRef.current === 'running'
    try {
      releaseAllInputs()
      if (wasRunning) emu.pause()
      await emu.loadState(state)
      releaseAllInputs()
    } finally {
      if (wasRunning && !options?.keepPaused && nostalgistRef.current === emu) {
        emu.resume()
        setStatus('running')
      }
      stateIoBusyRef.current = false
    }
  }, [releaseAllInputs])

  const getRomBytes = useCallback(async () => {
    const active = gameRef.current
    if (!active?.file) return null
    const buf = await active.file.arrayBuffer()
    return new Uint8Array(buf)
  }, [])

  const pressDown = useCallback(
    (button: string, player = 1) => {
      const apply = () => {
        const emu = nostalgistRef.current
        if (!emu) return
        const mapped = mapButton(button)
        const key = pressKey(player, mapped)
        const next = (pressCountsRef.current.get(key) ?? 0) + 1
        pressCountsRef.current.set(key, next)
        if (next === 1) {
          if (player === 1) emu.pressDown(mapped)
          else emu.pressDown({ button: mapped, player })
        }
      }

      if (stateIoBusyRef.current) {
        let attempts = 0
        const retry = () => {
          if (!stateIoBusyRef.current) {
            apply()
            return
          }
          attempts += 1
          if (attempts < 120) window.setTimeout(retry, 16)
        }
        retry()
        return
      }

      apply()
    },
    [mapButton],
  )

  const pressUp = useCallback(
    (button: string, player = 1) => {
      const emu = nostalgistRef.current
      if (!emu) return
      const mapped = mapButton(button)
      const key = pressKey(player, mapped)
      const next = Math.max(0, (pressCountsRef.current.get(key) ?? 0) - 1)
      pressCountsRef.current.set(key, next)
      if (next === 0) {
        if (player === 1) emu.pressUp(mapped)
        else emu.pressUp({ button: mapped, player })
      }
    },
    [mapButton],
  )

  const remotePressDown = useCallback(
    (button: string, player: number) => {
      pressDown(button, player)
    },
    [pressDown],
  )

  const remotePressUp = useCallback(
    (button: string, player: number) => {
      pressUp(button, player)
    },
    [pressUp],
  )

  const relaunchWithSettings = useCallback(() => {
    const active = gameRef.current
    if (!active) return
    if (active.source === 'demo') launchDemo()
    else if (active.file) launchFile(active.file)
  }, [launchDemo, launchFile])

  const waitForLaunch = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        launchWaiterRef.current = { resolve, reject }
        window.setTimeout(() => {
          if (launchWaiterRef.current) {
            launchWaiterRef.current.reject(new Error('Emulator launch timed out'))
            launchWaiterRef.current = null
          }
        }, 90_000)
      }),
    [],
  )

  const applyCoopTiming = useCallback(async () => {
    const active = gameRef.current
    if (!active || active.coopMode) return

    const stateBlob = await exportStateBlob({ keepPaused: true })
    if (!stateBlob) throw new Error('Could not capture save state for co-op timing')

    const coopGame: ActiveGame = { ...active, coopMode: true }

    const launch = (rom: File | string) => {
      queueLaunch({
        game: coopGame,
        rom,
        state: stateBlob,
        startPaused: true,
      })
    }

    if (active.source === 'demo') {
      launch('flappybird.nes')
    } else if (active.file) {
      launch(active.file)
    } else if (active.libraryFile) {
      const res = await fetch(romUrl(active.libraryFile))
      if (!res.ok) throw new Error(`Could not load ${active.libraryFile}`)
      const blob = await res.blob()
      const file = new File([blob], active.libraryFile, { type: 'application/octet-stream' })
      launch(file)
    } else {
      throw new Error('ROM unavailable for co-op timing relaunch')
    }

    await waitForLaunch()
  }, [exportStateBlob, queueLaunch, waitForLaunch])

  const getNostalgist = useCallback(() => nostalgistRef.current, [])

  return {
    status,
    error,
    game,
    launchGeneration,
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
    resumeAfterStateLoad,
    pressDown,
    pressUp,
    remotePressDown,
    remotePressUp,
    releaseAllInputs,
    isRunning,
    relaunchWithSettings,
    applyCoopTiming,
    getNostalgist,
  }
}
