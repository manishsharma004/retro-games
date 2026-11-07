import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedSettings } from './components/AdvancedSettings'
import { ControllerPanel } from './components/ControllerPanel'
import { EmulatorScreen } from './components/EmulatorScreen'
import { GamepadStatus } from './components/GamepadStatus'
import { LatencyBadge } from './components/LatencyBadge'
import { PlayHud } from './components/PlayHud'
import { PeerLobby } from './components/PeerLobby'
import { BigPicture } from './components/BigPicture'
import { RomLoader } from './components/RomLoader'
import { defaultExtensionForSystem, type SystemId, coreLabel } from './lib/cores'
import { VirtualController } from './components/VirtualController'
import { VirtualLayoutEditor } from './components/VirtualLayoutEditor'
import { useCoopInputDelay } from './hooks/useCoopInputDelay'
import { useCoopHoldSync } from './hooks/multiplayer/useCoopHoldSync'
import { useCoopSession } from './hooks/multiplayer/useCoopSession'
import { useCoopAutoStart } from './hooks/multiplayer/useCoopAutoStart'
import { useCoopSettingsSync } from './hooks/multiplayer/useCoopSettingsSync'
import { useHostGameSync } from './hooks/multiplayer/useHostGameSync'
import { useLocalHost } from './hooks/multiplayer/useLocalHost'
import { useRemoteHost } from './hooks/multiplayer/useRemoteHost'
import { useEmulator } from './hooks/useEmulator'
import { useEmulatorFps } from './hooks/useEmulatorFps'
import { useFullscreen } from './hooks/useFullscreen'
import { useGamepadControls } from './hooks/useGamepadControls'
import { useGamepads } from './hooks/useGamepads'
import { useLandscape } from './hooks/useLandscape'
import { useKeyboardControls } from './hooks/useKeyboardControls'
import { usePeerSession } from './hooks/usePeerSession'
import { usePreventGameTouchGestures } from './hooks/usePreventGameTouchGestures'
import type { PeerSeat, SessionMode } from './lib/peer/protocol'
import {
  loadControllerBindings,
  saveControllerBindings,
  type ControllerBindings,
} from './lib/gamepad'
import { fetchLibrary, type LibraryRom } from './lib/library'
import { useRomShelf } from './hooks/useRomShelf'
import {
  legacySettingsToProfile,
  loadSettings,
  profileHash,
  profileToEmulatorSettings,
  saveSettings,
  type CoopEmulatorProfile,
  type EmulatorSettings,
} from './lib/settings'
import type { MaxPlayers } from './lib/peer/roster'
import './styles/app.css'

function prefersTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

interface AppProps {
  initialCoopJoin?: string | null
}

export default function App({ initialCoopJoin = null }: AppProps) {
  const [settings, setSettings] = useState<EmulatorSettings>(() => loadSettings())
  const [controllerBindings, setControllerBindings] = useState<ControllerBindings>(() =>
    loadControllerBindings(),
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [peerOpen, setPeerOpen] = useState(Boolean(initialCoopJoin))
  const [controllersOpen, setControllersOpen] = useState(false)
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false)
  const [chromeMenuOpen, setChromeMenuOpen] = useState(false)
  const [section, setSection] = useState<'play' | 'roms'>('play')
  const chromeMenuRef = useRef<HTMLDivElement>(null)
  const [sessionMode, setSessionMode] = useState<SessionMode>(initialCoopJoin ? 'coop' : 'local')
  const [hostOnScreenP2, setHostOnScreenP2] = useState(false)
  const [hostMaxPlayers, setHostMaxPlayers] = useState<MaxPlayers>(2)
  const [touchDevice] = useState(() => prefersTouch())
  const [library, setLibrary] = useState<LibraryRom[]>([])
  const shelf = useRomShelf()
  const [shelfFocus, setShelfFocus] = useState<string | null>(null)
  const autoLoadedRef = useRef(false)
  const skipAutoLoadRef = useRef(Boolean(initialCoopJoin))
  const coopJoinStartedRef = useRef(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const {
    isFullscreen,
    cssFallback,
    sideways,
    portrait,
    toggle: toggleFullscreen,
    exit: exitFullscreen,
    toggleSideways,
  } = useFullscreen(playerRef)
  const pads = useGamepads()

  const emu = useEmulator(settings)
  const handleBootstrap = useCallback(
    async (payload: {
      name: string
      system: SystemId
      rom: Uint8Array
      state: Uint8Array
      settings: Partial<EmulatorSettings>
      profile?: CoopEmulatorProfile
    }) => {
      skipAutoLoadRef.current = true
      autoLoadedRef.current = true
      const profile =
        payload.profile ??
        legacySettingsToProfile({
          swapAB: payload.settings.swapAB ?? false,
          allowOpposingDirections: payload.settings.allowOpposingDirections ?? true,
          nesRegion: payload.settings.nesRegion ?? 'NTSC',
          nesTurbo: payload.settings.nesTurbo ?? 'None',
          snesRegion: payload.settings.snesRegion ?? 'ntsc',
          frameSkip: payload.settings.frameSkip ?? 0,
          rewindEnable: payload.settings.rewindEnable ?? false,
          videoVsync: payload.settings.videoVsync ?? false,
        })
      lastProfileRef.current = profile
      lastProfileHashRef.current = profileHash(profile)
      setSettings((prev) => profileToEmulatorSettings(prev, profile))
      const ext = defaultExtensionForSystem(payload.system)
      emu.launchPeer({
        name: payload.name,
        system: payload.system,
        rom: new Blob([
          payload.rom.buffer.slice(
            payload.rom.byteOffset,
            payload.rom.byteOffset + payload.rom.byteLength,
          ) as ArrayBuffer,
        ]),
        fileName: `${payload.name}.${ext}`,
        state: new Blob([
          payload.state.buffer.slice(
            payload.state.byteOffset,
            payload.state.byteOffset + payload.state.byteLength,
          ) as ArrayBuffer,
        ]),
        startPaused: true,
      })
    },
    [emu],
  )

  const handleGo = useCallback((resumeAt?: number) => {
    const run = () => emu.resume()
    if (!resumeAt) {
      run()
      return
    }
    const delay = resumeAt - Date.now()
    if (delay <= 0) run()
    else window.setTimeout(run, delay)
  }, [emu])

  const coopRef = useRef<ReturnType<typeof useCoopSession> | null>(null)
  const coopInputDelayRef = useRef<
    ((seat: PeerSeat, button: string, down: boolean, executeAt?: number) => void) | null
  >(null)
  const coopInputClearRef = useRef<(() => void) | null>(null)
  const coopHoldRef = useRef<{
    onRemoteHold: () => void
    onRemoteHoldRelease: (at: number) => void
  } | null>(null)
  const lastProfileHashRef = useRef<string | null>(null)
  const lastProfileRef = useRef<CoopEmulatorProfile | null>(null)

  const settingsSyncRef = useRef<(profile: CoopEmulatorProfile, hash: string) => void>(() => {})

  const peer = usePeerSession({
    settings,
    sessionMode,
    system: emu.game?.system ?? null,
    onRemoteInput: (seat, button, down, opts) => {
      if (sessionMode === 'coop') {
        const local = peerRef.current.getSeat()
        if (local !== null && seat === local) return
        coopInputDelayRef.current?.(seat, button, down, opts?.executeAt)
        return
      }
      if (down) emu.remotePressDown(button, seat)
      else emu.remotePressUp(button, seat)
    },
    onSettingsSync: (profile, hash) => settingsSyncRef.current(profile, hash),
    onBootstrap: handleBootstrap,
    onGo: handleGo,
    onGuestHello: () => {
      const game = emu.game
      if (!game || emu.status === 'idle' || emu.status === 'loading') return
      if (sessionMode === 'coop') {
        void coopRef.current?.shareGame().catch(() => {})
        return
      }
      if (sessionMode === 'local' || sessionMode === 'remote') {
        peerRef.current.syncHostGameToGuests({
          name: game.name,
          system: game.system,
          core: game.core,
          libraryFile: game.libraryFile,
        })
      }
    },
    onLinked: () => {},
    onRumble: (seat, pattern) => {
      if (seat === peerRef.current.seat) {
        try {
          navigator.vibrate?.(pattern)
        } catch {
          // ignore
        }
      }
    },
    onResyncRequest: () => {
      if (sessionMode !== 'coop') return
      void coopRef.current?.handleResyncRequest()
    },
    onResyncState: (state, compressed, resumeAt) => {
      if (sessionMode !== 'coop') return
      void coopRef.current?.handleResyncState(state, compressed, resumeAt)
    },
    onResyncStart: () => {
      if (sessionMode !== 'coop') return
      coopInputClearRef.current?.()
      coopRef.current?.handleResyncStart()
    },
    onResyncDone: (resumeAt) => {
      if (sessionMode !== 'coop') return
      coopRef.current?.handleResyncDone(resumeAt)
    },
    onCoopHold: () => {
      if (sessionMode !== 'coop') return
      coopHoldRef.current?.onRemoteHold()
    },
    onCoopHoldRelease: (at) => {
      if (sessionMode !== 'coop') return
      coopHoldRef.current?.onRemoteHoldRelease(at)
    },
    onHostExit: () => {
      emu.exit()
    },
  })

  const peerRef = useRef(peer)
  peerRef.current = peer

  const isHost = peer.role === 'host'
  const isGuest = peer.role === 'guest'

  const resolveLocalSeat = useCallback((): 1 | 2 => {
    if (hostOnScreenP2 && sessionMode === 'local' && isHost) return 2
    return (peer.getSeat() ?? 1) as 1 | 2
  }, [hostOnScreenP2, sessionMode, isHost, peer.getSeat])

  const localSeat = resolveLocalSeat()
  const peerPlaying = peer.phase === 'playing'
  const peerActive = peer.role !== null && peer.phase !== 'idle' && peer.phase !== 'error'

  const coop = useCoopSession({
    enabled: sessionMode === 'coop',
    peer,
    emu,
    isHost,
    settings,
    lastProfileHashRef,
    onResyncPause: () => coopInputClearRef.current?.(),
  })
  coopRef.current = coop

  const { handleSettingsSync } = useCoopSettingsSync({
    enabled: sessionMode === 'coop',
    isHost,
    playing: peerPlaying,
    settings,
    peer,
    emu,
    setSettings,
    lastProfileHashRef,
    lastProfileRef,
  })

  useEffect(() => {
    settingsSyncRef.current = handleSettingsSync
  }, [handleSettingsSync])

  const { queueLocalInput, applyRemoteInput, clearPending } = useCoopInputDelay({
    enabled: sessionMode === 'coop' && peerPlaying,
    delayMs: peer.latencyProfile.coopInputDelayMs,
    clockOffsetMs: peer.clockOffsetMs,
    localSeat: peer.getSeat(),
    handlers: {
      pressDown: emu.pressDown,
      pressUp: emu.pressUp,
    },
    sendInput: peer.sendInput,
  })

  useEffect(() => {
    coopInputDelayRef.current = sessionMode === 'coop' ? applyRemoteInput : null
    coopInputClearRef.current = sessionMode === 'coop' ? clearPending : null
  }, [sessionMode, applyRemoteInput, clearPending])

  const { onRemoteHold, onRemoteHoldRelease } = useCoopHoldSync({
    enabled: sessionMode === 'coop' && peerPlaying,
    playing: peerPlaying,
    emu,
    sendHold: peer.sendCoopHold,
    sendHoldRelease: peer.sendCoopHoldRelease,
  })

  useEffect(() => {
    coopHoldRef.current =
      sessionMode === 'coop'
        ? { onRemoteHold, onRemoteHoldRelease }
        : null
  }, [sessionMode, onRemoteHold, onRemoteHoldRelease])

  useLocalHost({
    enabled: sessionMode === 'local' && isHost,
    peer,
    emu,
    isHost,
    hostOnScreenP2,
  })

  useRemoteHost({
    enabled: isHost && sessionMode === 'remote',
    peer,
    emu,
    isHost,
    shareAudio: settings.remoteShareAudio,
    onVideoOnly: () => {},
    streamGeneration: peer.streamGeneration,
  })

  useEffect(() => {
    if (!initialCoopJoin || coopJoinStartedRef.current) return
    coopJoinStartedRef.current = true
    skipAutoLoadRef.current = true
    autoLoadedRef.current = true
    void peer.joinWithRoomCode(initialCoopJoin, 'coop')
  }, [initialCoopJoin, peer.joinWithRoomCode])

  useEffect(() => {
    if (isGuest) {
      skipAutoLoadRef.current = true
      autoLoadedRef.current = true
    }
  }, [isGuest])

  useHostGameSync({
    enabled: peerActive && isHost,
    peer,
    emu,
    coop,
    isHost,
    sessionMode,
  })

  useCoopAutoStart({
    enabled: sessionMode === 'coop' && peerActive,
    peer,
    emu,
    isHost,
  })

  const handleExitGame = useCallback(() => {
    if (
      peer.role === 'host' &&
      peer.connectionState === 'connected' &&
      peer.phase !== 'idle' &&
      peer.phase !== 'error'
    ) {
      peer.sendHostExit()
    }
    emu.exit()
  }, [peer, emu])

  const onLocalPress = useCallback(
    (button: string) => {
      if (sessionMode === 'coop' && peerPlaying) {
        queueLocalInput(button, true)
        return
      }
      const seat = resolveLocalSeat()
      emu.pressDown(button, seat)
      if (peerPlaying) peer.sendInput(button, true)
    },
    [emu, resolveLocalSeat, peer, peerPlaying, sessionMode, queueLocalInput],
  )

  const onLocalRelease = useCallback(
    (button: string) => {
      if (sessionMode === 'coop' && peerPlaying) {
        queueLocalInput(button, false)
        return
      }
      const seat = resolveLocalSeat()
      emu.pressUp(button, seat)
      if (peerPlaying) peer.sendInput(button, false)
    },
    [emu, resolveLocalSeat, peer, peerPlaying, sessionMode, queueLocalInput],
  )

  const onPadPress = useCallback(
    (button: string, player: number) => {
      const seat = resolveLocalSeat()
      if (sessionMode === 'coop' && peerPlaying && player === seat) {
        queueLocalInput(button, true)
        return
      }
      emu.pressDown(button, player)
      if (peerPlaying && player === seat) peer.sendInput(button, true)
    },
    [emu, resolveLocalSeat, peer, peerPlaying, sessionMode, queueLocalInput],
  )

  const onPadRelease = useCallback(
    (button: string, player: number) => {
      const seat = resolveLocalSeat()
      if (sessionMode === 'coop' && peerPlaying && player === seat) {
        queueLocalInput(button, false)
        return
      }
      emu.pressUp(button, player)
      if (peerPlaying && player === seat) peer.sendInput(button, false)
    },
    [emu, resolveLocalSeat, peer, peerPlaying, sessionMode, queueLocalInput],
  )

  const inputEnabled =
    (emu.status === 'running' || emu.status === 'paused') &&
    !settingsOpen &&
    !peerOpen &&
    !controllersOpen &&
    !layoutEditorOpen &&
    !chromeMenuOpen

  useKeyboardControls({
    enabled: inputEnabled,
    onPress: onLocalPress,
    onRelease: onLocalRelease,
  })

  const maxLocalSeats =
    peer.multiGuest && peer.maxPlayers > 2
      ? peer.maxPlayers
      : emu.game?.system === 'snes'
        ? settings.snesPlayerCount
        : 2

  useGamepadControls({
    enabled: inputEnabled,
    bindings: controllerBindings,
    peerSeat: peerActive && localSeat !== null ? localSeat : null,
    maxLocalSeats,
    onPress: onPadPress,
    onRelease: onPadRelease,
  })

  useEffect(() => {
    const timer = window.setTimeout(() => saveSettings(settings), 300)
    return () => window.clearTimeout(timer)
  }, [settings])

  useEffect(() => {
    const timer = window.setTimeout(() => saveControllerBindings(controllerBindings), 300)
    return () => window.clearTimeout(timer)
  }, [controllerBindings])

  useEffect(() => {
    let cancelled = false
    void fetchLibrary().then((roms) => {
      if (cancelled) return
      setLibrary(roms)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      const bc = new BroadcastChannel('retro-games-lobby')
      bc.onmessage = (event) => {
        if (event.data?.type === 'join-offer' && peer.phase === 'idle') {
          setPeerOpen(true)
          void peer.joinWithOffer(event.data.offer, event.data.mode ?? 'local')
        }
      }
      return () => bc.close()
    } catch {
      return undefined
    }
  }, [peer])

  const showVirtual = useMemo(() => {
    if (settings.showVirtualController === 'auto') return touchDevice
    return settings.showVirtualController
  }, [settings.showVirtualController, touchDevice])

  const isLandscape = useLandscape()
  const padOverlay = settings.virtualControlsOverlay || isLandscape
  const effectivePadOverlay = padOverlay || isFullscreen || sideways
  const minimalFs = isFullscreen
  const emuFps = useEmulatorFps(emu.canvasRef, emu.status === 'running')

  const isPlaying = emu.status === 'running' || emu.status === 'paused' || emu.status === 'loading'
  const showLanding = !isPlaying

  usePreventGameTouchGestures(playerRef, isPlaying)

  useEffect(() => {
    if (!isPlaying && isFullscreen) {
      void exitFullscreen()
    }
  }, [isPlaying, isFullscreen, exitFullscreen])

  useEffect(() => {
    if (!isPlaying) setChromeMenuOpen(false)
  }, [isPlaying])

  useEffect(() => {
    if (!chromeMenuOpen) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (chromeMenuRef.current?.contains(target)) return
      setChromeMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChromeMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [chromeMenuOpen])

  const canHostShareGame = Boolean(
    isHost &&
      peer.connectionState === 'connected' &&
      emu.game &&
      (emu.status === 'running' || emu.status === 'paused') &&
      (emu.game.file || emu.game.source === 'demo' || emu.game.source === 'library'),
  )

  const emuReadyForPeer = emu.status === 'running' || emu.status === 'paused'

  const showHostP2Pad =
    sessionMode === 'local' && isHost && hostOnScreenP2 && peer.connectionState === 'connected'

  const sessionLabel =
    sessionMode === 'local' ? 'Couch' : sessionMode === 'remote' ? 'Stream' : 'Co-op'

  return (
    <div className={`app ${isPlaying ? 'app--playing' : 'app--landing'}`}>
      <div className="atmosphere" aria-hidden="true" />

      {showLanding && (
        <>
          <nav className="app-nav" aria-label="Sections">
            <p className="app-nav__brand">Retro Games</p>
            <div className="app-nav__links">
              {(
                [
                  ['play', 'Play'],
                  ['roms', 'ROMs'],
                  ['controllers', 'Controllers'],
                  ['multiplayer', 'Multiplayer'],
                  ['settings', 'Settings'],
                ] as const
              ).map(([id, label]) => {
                const open =
                  (id === 'controllers' && controllersOpen) ||
                  (id === 'multiplayer' && peerOpen) ||
                  (id === 'settings' && settingsOpen) ||
                  ((id === 'play' || id === 'roms') && section === id && !controllersOpen && !peerOpen && !settingsOpen)
                return (
                <button
                  key={id}
                  type="button"
                  className={open ? 'app-nav__link app-nav__link--active' : 'app-nav__link'}
                  aria-current={open ? 'page' : undefined}
                  onClick={() => {
                    if (id === 'controllers') {
                      setPeerOpen(false)
                      setSettingsOpen(false)
                      setControllersOpen(true)
                      return
                    }
                    if (id === 'multiplayer') {
                      setControllersOpen(false)
                      setSettingsOpen(false)
                      setPeerOpen(true)
                      return
                    }
                    if (id === 'settings') {
                      setControllersOpen(false)
                      setPeerOpen(false)
                      setSettingsOpen(true)
                      return
                    }
                    setControllersOpen(false)
                    setPeerOpen(false)
                    setSettingsOpen(false)
                    setSection(id)
                  }}
                >
                  {label}
                </button>
                )
              })}
            </div>
          </nav>
          <main className="app-main">
            {section === 'play' && (
              <BigPicture
                bundled={library}
                imported={shelf.entries}
                disabled={emu.status === 'loading'}
                error={emu.error}
                shelfError={shelf.error}
                focusId={shelfFocus}
                arcadeCore={settings.arcadeCore}
                onArcadeCoreChange={(core) => setSettings((prev) => ({ ...prev, arcadeCore: core }))}
                onPlayFiles={(files, options) => emu.launchFile(files, options)}
                onPlayBundled={(rom) => emu.launchLibrary(rom)}
                onDemo={emu.launchDemo}
                onAdd={async (files, options) => {
                  const id = await shelf.add(files, options)
                  setShelfFocus(id)
                  return id
                }}
                onRemove={shelf.remove}
                onUseCover={shelf.useCover}
                onRegenerateCover={shelf.regenerate}
                suspendNavigation={controllersOpen || peerOpen || settingsOpen || layoutEditorOpen}
              />
            )}
            {section === 'roms' && (
              <section className="manage" aria-label="ROM library">
                <h1 className="manage__title">ROMs</h1>
                <p className="manage__lead">
                  Files stay in this browser. The file name suggests a system, and every Nostalgist
                  core is in that list. Arcade zips let you pick the emulator before the game starts.
                </p>
                <RomLoader
                  disabled={emu.status === 'loading'}
                  arcadeCore={settings.arcadeCore}
                  onArcadeCoreChange={(core) => setSettings((prev) => ({ ...prev, arcadeCore: core }))}
                  onFile={(files, options) => emu.launchFile(files, options)}
                  onAddToLibrary={(files, options) => {
                    if (!options?.system || !options.core) return
                    void shelf.add(files, { system: options.system, core: options.core }).then((id) => {
                      setShelfFocus(id)
                      setSection('play')
                    })
                  }}
                  onDemo={emu.launchDemo}
                />
                {emu.error && <p className="hero__error">{emu.error}</p>}
              </section>
            )}
          </main>
        </>
      )}

      <div
        ref={playerRef}
        className={[
          'player',
          !isPlaying && 'player--parked',
          isFullscreen && 'player--fullscreen',
          cssFallback && 'player--fullscreen-faux',
          sideways && 'player--sideways',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={!isPlaying}
      >
        {isPlaying && minimalFs ? (
          <>
            <PlayHud
              className="play-hud--corner"
              fps={emuFps}
              latencyProfile={peer.latencyProfile}
              peerConnected={Boolean(peer.role && peer.connectionState === 'connected')}
            />
            <div className="fs-corner-actions">
              {touchDevice && (portrait || sideways) && (
                <button
                  type="button"
                  className="fs-exit-btn"
                  onClick={toggleSideways}
                  aria-label={sideways ? 'Play upright' : 'Play sideways'}
                  title={sideways ? 'Play upright' : 'Turn the screen sideways'}
                >
                  {sideways ? '↕' : '↔'}
                </button>
              )}
              <button
                type="button"
                className="fs-exit-btn"
                onClick={() => void toggleFullscreen()}
                aria-label="Exit fullscreen"
                title="Exit fullscreen"
              >
                ✕
              </button>
            </div>
          </>
        ) : isPlaying ? (
          <div className={`toolbar ${isFullscreen ? 'toolbar--overlay' : ''}`}>
            <div className="toolbar__left">
              <span className="toolbar__brand">Retro Games</span>
              {emu.game && (
                <span className="toolbar__rom" title={emu.game.name}>
                  {emu.game.system.toUpperCase()} · {emu.game.name}
                  {emu.game.system === 'arcade' && (
                    <> · {coreLabel(emu.game.core)}</>
                  )}
                </span>
              )}
              {peer.role && (
                <>
                  <span className="toolbar__peer" title="Multiplayer session">
                    {sessionLabel} · P{peer.seat}
                    {peer.phase !== 'playing' ? ` · ${peer.phase}` : ''}
                  </span>
                  <LatencyBadge
                    profile={peer.latencyProfile}
                    connected={peer.connectionState === 'connected'}
                    detail={
                      sessionMode === 'remote' && isHost && peer.latencyProfile.streamFps < 60
                        ? `${peer.latencyProfile.streamFps} FPS`
                        : emuFps !== null
                          ? `${emuFps} FPS`
                          : null
                    }
                  />
                </>
              )}
            </div>
            <div className="toolbar__actions">
              {emu.status === 'paused' ? (
                <button
                  type="button"
                  className="btn btn--primary btn--toolbar"
                  onClick={emu.resume}
                  disabled={peer.phase === 'ready-wait'}
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--toolbar"
                  onClick={emu.pause}
                  disabled={emu.status !== 'running'}
                >
                  Pause
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--toolbar"
                onClick={() => void toggleFullscreen()}
              >
                {isFullscreen ? 'Exit full' : 'Fullscreen'}
              </button>
              {touchDevice && (portrait || sideways) && (
                <button type="button" className="btn btn--ghost btn--toolbar" onClick={toggleSideways}>
                  {sideways ? 'Upright' : 'Sideways'}
                </button>
              )}
              <button type="button" className="btn btn--ghost btn--toolbar" onClick={handleExitGame}>
                Exit
              </button>
            </div>
            <div className="toolbar__more" ref={chromeMenuRef}>
              <button
                type="button"
                className="btn btn--ghost btn--toolbar"
                aria-expanded={chromeMenuOpen}
                aria-haspopup="menu"
                aria-controls="play-more-menu"
                onClick={() => setChromeMenuOpen((open) => !open)}
              >
                More
              </button>
              {chromeMenuOpen && (
                <div className="toolbar-menu" id="play-more-menu" role="menu">
                  <RomLoader
                    compact
                    disabled={emu.status === 'loading'}
                    arcadeCore={settings.arcadeCore}
                    onArcadeCoreChange={(core) => setSettings((prev) => ({ ...prev, arcadeCore: core }))}
                    onFile={(files, options) => {
                      setChromeMenuOpen(false)
                      emu.launchFile(files, options)
                    }}
                    onDemo={() => {
                      setChromeMenuOpen(false)
                      emu.launchDemo()
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--menu"
                    role="menuitem"
                    onClick={() => {
                      setChromeMenuOpen(false)
                      setPeerOpen(true)
                    }}
                  >
                    Play with friends
                  </button>
                  {sessionMode === 'coop' && peerPlaying && (
                    <button
                      type="button"
                      className="btn btn--menu"
                      role="menuitem"
                      disabled={coop.stateSyncBusy || emu.status === 'loading'}
                      onClick={() => {
                        setChromeMenuOpen(false)
                        void coop.syncGameState().catch(() => {})
                      }}
                      title={isHost ? 'Send save state to peer' : 'Fetch save state from host'}
                    >
                      {coop.stateSyncBusy ? 'Syncing…' : 'Sync state'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--menu"
                    role="menuitem"
                    onClick={() => {
                      setChromeMenuOpen(false)
                      emu.restart()
                    }}
                    disabled={emu.status === 'loading' || peerPlaying || sessionMode === 'coop'}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="btn btn--menu"
                    role="menuitem"
                    onClick={() => {
                      setChromeMenuOpen(false)
                      void emu.saveState()
                    }}
                    disabled={
                      sessionMode === 'coop' ||
                      (emu.status !== 'running' && emu.status !== 'paused')
                    }
                  >
                    Save state
                  </button>
                  <button
                    type="button"
                    className="btn btn--menu"
                    role="menuitem"
                    onClick={() => {
                      setChromeMenuOpen(false)
                      void emu.loadState()
                    }}
                    disabled={
                      sessionMode === 'coop' ||
                      (emu.status !== 'running' && emu.status !== 'paused')
                    }
                  >
                    Load state
                  </button>
                  <button
                    type="button"
                    className="btn btn--menu"
                    role="menuitem"
                    onClick={() => {
                      setChromeMenuOpen(false)
                      emu.toggleFastForward()
                    }}
                    disabled={emu.status !== 'running' || peerPlaying || sessionMode === 'coop'}
                  >
                    Fast forward
                  </button>
                  <button
                    type="button"
                    className="btn btn--menu"
                    role="menuitem"
                    onClick={() => {
                      setChromeMenuOpen(false)
                      setSettingsOpen(true)
                    }}
                  >
                    Settings
                  </button>
                  {showVirtual && (
                    <button
                      type="button"
                      className="btn btn--menu"
                      role="menuitem"
                      onClick={() => {
                        setChromeMenuOpen(false)
                        setLayoutEditorOpen(true)
                      }}
                      disabled={emu.status === 'loading'}
                    >
                      Pad layout
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--menu"
                    role="menuitem"
                    onClick={() => {
                      setChromeMenuOpen(false)
                      setControllersOpen(true)
                    }}
                  >
                    Controllers
                  </button>
                </div>
              )}
            </div>
            <GamepadStatus pads={pads} onOpen={() => setControllersOpen(true)} />
          </div>
        ) : null}

        <EmulatorScreen
          canvasRef={emu.canvasRef}
          system={emu.game?.system ?? null}
          status={emu.status}
          padOverlay={effectivePadOverlay}
        >
          {emu.game && isPlaying && (
            <>
              <VirtualController
                system={emu.game.system}
                onPress={onLocalPress}
                onRelease={onLocalRelease}
                visible={showVirtual && emu.status !== 'loading' && !layoutEditorOpen && !showHostP2Pad}
                dpadMode={settings.virtualDpadMode}
                overlay={effectivePadOverlay}
                size={settings.virtualControlsSize}
                scaleBoost={isLandscape ? 1 : 1.4}
                opacity={settings.virtualControlsOpacity}
                layout={settings.virtualControlsLayout}
              />
              {showHostP2Pad && (
                <VirtualController
                  system={emu.game.system}
                  onPress={(b) => {
                    emu.pressDown(b, 2)
                    if (peerPlaying) peer.sendInput(b, true)
                  }}
                  onRelease={(b) => {
                    emu.pressUp(b, 2)
                    if (peerPlaying) peer.sendInput(b, false)
                  }}
                  visible
                  dpadMode={settings.virtualDpadMode}
                  overlay
                  size={settings.virtualControlsSize}
                  scaleBoost={1}
                  opacity={0.75}
                  layout={settings.virtualControlsLayout}
                />
              )}
            </>
          )}
        </EmulatorScreen>

        {emu.game && isPlaying && layoutEditorOpen && (
          <VirtualLayoutEditor
            open={layoutEditorOpen}
            system={emu.game.system}
            layout={settings.virtualControlsLayout}
            dpadMode={settings.virtualDpadMode}
            size={settings.virtualControlsSize}
            opacity={settings.virtualControlsOpacity}
            gameName={emu.game.name}
            gamepadName={pads[0]?.id ?? null}
            onSave={(nextLayout, options) => {
              setSettings((prev) => ({
                ...prev,
                virtualControlsLayout: nextLayout,
                virtualControlsOpacity: options?.opacity ?? prev.virtualControlsOpacity,
              }))
              setLayoutEditorOpen(false)
            }}
            onCancel={() => setLayoutEditorOpen(false)}
            onOpenSettings={() => {
              setLayoutEditorOpen(false)
              setSettingsOpen(true)
            }}
            onOpenControllers={() => {
              setLayoutEditorOpen(false)
              setControllersOpen(true)
            }}
          />
        )}

        {isPlaying && emu.error && <p className="player__error">{emu.error}</p>}
      </div>

      <AdvancedSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        system={emu.game?.system ?? null}
        isRunning={emu.status === 'running' || emu.status === 'paused'}
        onApplyRelaunch={() => {
          setSettingsOpen(false)
          void emu.relaunchWithSettings()
        }}
        gameName={emu.game?.name}
        coreName={emu.game?.core}
        gamepadCount={pads.length}
        onOpenControllers={() => {
          setSettingsOpen(false)
          setControllersOpen(true)
        }}
        onOpenLayoutEditor={() => {
          setSettingsOpen(false)
          setLayoutEditorOpen(true)
        }}
        remoteHost={sessionMode === 'remote' && isHost && peerActive}
        coopGuest={sessionMode === 'coop' && isGuest && peerActive}
      />

      <ControllerPanel
        open={controllersOpen}
        onClose={() => setControllersOpen(false)}
        pads={pads}
        bindings={controllerBindings}
        onChange={setControllerBindings}
        peerSeat={peerActive && localSeat !== null ? localSeat : null}
        maxLocalSeats={maxLocalSeats}
        multiGuest={peer.multiGuest}
        maxPlayers={peer.maxPlayers}
        remoteSeat={
          (sessionMode === 'coop' || sessionMode === 'local') && peerActive
            ? peer.remoteSeat
            : null
        }
        onPickSeat={
          peer.connectionState === 'connected' ? peer.pickSeat : undefined
        }
        onPickRole={peer.connectionState === 'connected' ? peer.pickRole : undefined}
        remoteSpectator={peer.remoteSpectator}
        isSeatAvailable={
          peer.connectionState === 'connected' ? peer.isSeatAvailable : undefined
        }
        swapAB={settings.swapAB}
        onSwapAB={(value) => setSettings((prev) => ({ ...prev, swapAB: value }))}
        swapLocked={sessionMode === 'coop' && isGuest && peerActive}
      />

      <PeerLobby
        open={peerOpen}
        onClose={() => setPeerOpen(false)}
        phase={peer.phase}
        role={peer.role}
        seat={peer.seat}
        sessionMode={sessionMode}
        onSessionModeChange={setSessionMode}
        connectionState={peer.connectionState}
        localSignal={peer.localSignal}
        roomCode={peer.roomCode}
        joinUrl={peer.joinUrl}
        signalingLabel={peer.signalingLabel}
        connectionPathLabel={peer.connectionPathLabel}
        connectivityHint={peer.connectivityHint}
        connectivityProbeSummary={peer.connectivityProbeSummary}
        useManualSignaling={peer.useManualSignaling}
        transfer={peer.transfer}
        error={peer.error}
        remoteReady={peer.remoteReady}
        canHostShareGame={canHostShareGame}
        emuReady={emuReadyForPeer}
        hostOnScreenP2={hostOnScreenP2}
        onHostOnScreenP2Change={setHostOnScreenP2}
        onCreateHost={() =>
          peer.createHostOffer(sessionMode, {
            maxPlayers: hostMaxPlayers,
            system: emu.game?.system === 'snes' ? 'snes' : emu.game?.system === 'nes' ? 'nes' : undefined,
          })
        }
        onAcceptAnswer={(answer) => peer.acceptGuestAnswer(answer)}
        onJoinOffer={(offer) => peer.joinWithOffer(offer, sessionMode)}
        onJoinRoomCode={(code, opts) => peer.joinWithRoomCode(code, sessionMode, opts)}
        onReconnect={() => peer.reconnectSession()}
        connectionLost={peer.connectionLost}
        onShareGame={() => coop.shareGame()}
        onReady={() => peer.sendReady()}
        onGo={() => peer.sendGo()}
        onDisconnect={() => peer.disconnect()}
        remoteSeat={peer.remoteSeat}
        remoteSpectator={peer.remoteSpectator}
        onPickRole={peer.pickRole}
        onPickSeat={peer.pickSeat}
        isSeatAvailable={peer.isSeatAvailable}
        onSyncGameState={
          sessionMode === 'coop' && peerPlaying
            ? () => coop.syncGameState()
            : undefined
        }
        stateSyncBusy={coop.stateSyncBusy}
        latencyProfile={peer.latencyProfile}
        suggestStateSync={coop.suggestStateSync}
        onOpenControllers={() => {
          setPeerOpen(false)
          setControllersOpen(true)
        }}
        gameSystem={emu.game?.system ?? null}
        multiGuest={peer.multiGuest}
        maxPlayers={peer.multiGuest ? peer.maxPlayers : hostMaxPlayers}
        onMaxPlayersChange={(n) => {
          setHostMaxPlayers(n)
          if (n > 2) {
            setSettings((s) => ({ ...s, snesPlayerCount: n }))
          }
        }}
        roster={peer.roster}
        connectedGuestCount={peer.connectedGuestCount}
      />

      {showLanding && section === 'play' && (
        <footer className="site-footer">
          <span>Powered by Nostalgist · ROMs stay on this device</span>
        </footer>
      )}
    </div>
  )
}
