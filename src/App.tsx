import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedSettings } from './components/AdvancedSettings'
import { ControllerPanel } from './components/ControllerPanel'
import { EmulatorScreen } from './components/EmulatorScreen'
import { GamepadStatus } from './components/GamepadStatus'
import { LatencyBadge } from './components/LatencyBadge'
import { PlayHud } from './components/PlayHud'
import { PeerLobby } from './components/PeerLobby'
import { RomLoader } from './components/RomLoader'
import { VirtualController } from './components/VirtualController'
import { VirtualLayoutEditor } from './components/VirtualLayoutEditor'
import { useCoopInputDelay } from './hooks/useCoopInputDelay'
import { useCoopSession } from './hooks/multiplayer/useCoopSession'
import { useCoopAutoStart } from './hooks/multiplayer/useCoopAutoStart'
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
import { coopTimingSettings, loadSettings, saveSettings, type EmulatorSettings } from './lib/settings'
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
  const [sessionMode, setSessionMode] = useState<SessionMode>(initialCoopJoin ? 'coop' : 'local')
  const [hostOnScreenP2, setHostOnScreenP2] = useState(false)
  const [hostMaxPlayers, setHostMaxPlayers] = useState<MaxPlayers>(2)
  const [touchDevice] = useState(() => prefersTouch())
  const [library, setLibrary] = useState<LibraryRom[]>([])
  const autoLoadedRef = useRef(false)
  const skipAutoLoadRef = useRef(Boolean(initialCoopJoin))
  const coopJoinStartedRef = useRef(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const {
    isFullscreen,
    cssFallback,
    toggle: toggleFullscreen,
    exit: exitFullscreen,
  } = useFullscreen(playerRef)
  const pads = useGamepads()

  const emu = useEmulator(settings)
  const { launchLibrary } = emu

  const handleBootstrap = useCallback(
    async (payload: {
      name: string
      system: 'nes' | 'snes'
      rom: Uint8Array
      state: Uint8Array
      settings: Partial<EmulatorSettings>
    }) => {
      skipAutoLoadRef.current = true
      autoLoadedRef.current = true
      setSettings((prev) =>
        coopTimingSettings({
          ...prev,
          swapAB: payload.settings.swapAB ?? prev.swapAB,
          allowOpposingDirections:
            payload.settings.allowOpposingDirections ?? prev.allowOpposingDirections,
          nesRegion: payload.settings.nesRegion ?? prev.nesRegion,
          nesTurbo: payload.settings.nesTurbo ?? prev.nesTurbo,
          snesRegion: payload.settings.snesRegion ?? prev.snesRegion,
          frameSkip: payload.settings.frameSkip ?? prev.frameSkip,
          rewindEnable: payload.settings.rewindEnable ?? prev.rewindEnable,
          videoVsync: payload.settings.videoVsync ?? prev.videoVsync,
        }),
      )
      const ext = payload.system === 'nes' ? 'nes' : 'sfc'
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

  const peer = usePeerSession({
    settings,
    sessionMode,
    system: emu.game?.system ?? null,
    onRemoteInput: (seat, button, down, executeAt) => {
      if (sessionMode === 'coop') {
        const local = peerRef.current.getSeat()
        if (local !== null && seat === local) return
        coopInputDelayRef.current?.(seat, button, down, executeAt)
        return
      }
      if (down) emu.remotePressDown(button, seat)
      else emu.remotePressUp(button, seat)
    },
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
        peerRef.current.sendGameUpdate({
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
    onResyncState: (state, compressed) => {
      if (sessionMode !== 'coop') return
      void coopRef.current?.handleResyncState(state, compressed)
    },
    onResyncStart: () => {
      if (sessionMode !== 'coop') return
      coopRef.current?.handleResyncStart()
    },
    onResyncDone: (resumeAt) => {
      if (sessionMode !== 'coop') return
      coopRef.current?.handleResyncDone(resumeAt)
    },
    onHostExit: () => {
      emu.exit()
    },
  })

  const peerRef = useRef(peer)
  peerRef.current = peer

  const isHost = peer.role === 'host'
  const isGuest = peer.role === 'guest'

  const coop = useCoopSession({
    enabled: sessionMode === 'coop',
    peer,
    emu,
    isHost,
  })
  coopRef.current = coop

  useLocalHost({
    enabled: sessionMode === 'local' && isHost,
    peer,
    emu,
    isHost,
    hostOnScreenP2,
  })

  useRemoteHost({
    enabled: sessionMode === 'remote' && isHost,
    peer,
    emu,
    isHost,
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

  const resolveLocalSeat = useCallback((): 1 | 2 => {
    if (hostOnScreenP2 && sessionMode === 'local' && isHost) return 2
    return (peer.getSeat() ?? 1) as 1 | 2
  }, [hostOnScreenP2, sessionMode, isHost, peer.getSeat])

  const localSeat = resolveLocalSeat()
  const peerPlaying = peer.phase === 'playing'
  const peerActive = peer.role !== null && peer.phase !== 'idle' && peer.phase !== 'error'

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

  const { queueLocalInput, applyRemoteInput } = useCoopInputDelay({
    enabled: sessionMode === 'coop' && peerPlaying,
    delayMs: peer.latencyProfile.coopInputDelayMs,
    localSeat: localSeat === 1 || localSeat === 2 ? localSeat : null,
    handlers: {
      pressDown: emu.pressDown,
      pressUp: emu.pressUp,
    },
    sendInput: peer.sendInput,
  })

  useEffect(() => {
    coopInputDelayRef.current = sessionMode === 'coop' ? applyRemoteInput : null
  }, [sessionMode, applyRemoteInput])

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
    !layoutEditorOpen

  useKeyboardControls({
    enabled: inputEnabled,
    onPress: onLocalPress,
    onRelease: onLocalRelease,
  })

  const maxLocalSeats =
    emu.game?.system === 'snes' ? settings.snesPlayerCount : 2

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
      const preset = roms.find((rom) => rom.default)
      if (preset && !autoLoadedRef.current && !skipAutoLoadRef.current) {
        autoLoadedRef.current = true
        launchLibrary(preset)
      }
    })
    return () => {
      cancelled = true
    }
  }, [launchLibrary])

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
  const effectivePadOverlay = padOverlay || isFullscreen
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

  return (
    <div className={`app ${isPlaying ? 'app--playing' : 'app--landing'}`}>
      <div className="atmosphere" aria-hidden="true" />

      {showLanding && (
        <header className="hero">
          <p className="hero__brand">Retro Games</p>
          <h1 className="hero__tagline">Play NES &amp; SNES ROMs in your browser</h1>
          <p className="hero__sub">
            Local files only. Link devices for multiplayer — phones as controllers, remote stream,
            or dual-emulator co-op (ROM setup, then input sync).
          </p>
          <RomLoader
            disabled={emu.status === 'loading'}
            onFile={emu.launchFile}
            onDemo={emu.launchDemo}
          />
          <div className="hero__peer">
            <button type="button" className="btn btn--primary" onClick={() => setPeerOpen(true)}>
              Play with Friends
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setControllersOpen(true)}>
              Controllers
            </button>
          </div>
          {library.length > 0 && (
            <div className="library">
              <p className="library__title">Built-in games</p>
              <div className="library__grid">
                {library.map((rom) => (
                  <button
                    key={rom.file}
                    type="button"
                    className="btn btn--ghost library__item"
                    disabled={emu.status === 'loading'}
                    onClick={() => emu.launchLibrary(rom)}
                  >
                    <span className="library__name">{rom.name}</span>
                    <span className="library__system">{rom.system.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {emu.error && <p className="hero__error">{emu.error}</p>}
        </header>
      )}

      <div
        ref={playerRef}
        className={[
          'player',
          !isPlaying && 'player--parked',
          isFullscreen && 'player--fullscreen',
          cssFallback && 'player--fullscreen-faux',
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
            <button
              type="button"
              className="fs-exit-btn"
              onClick={() => void toggleFullscreen()}
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
            >
              ✕
            </button>
          </>
        ) : isPlaying ? (
          <div className={`toolbar ${isFullscreen ? 'toolbar--overlay' : ''}`}>
            <div className="toolbar__left">
              <span className="toolbar__brand">Retro Games</span>
              {emu.game && (
                <span className="toolbar__rom" title={emu.game.name}>
                  {emu.game.system.toUpperCase()} · {emu.game.name}
                </span>
              )}
              {peer.role && (
                <>
                  <span className="toolbar__peer" title="Multiplayer session">
                    {sessionMode} · P{peer.seat} · {peer.phase}
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
              <RomLoader
                compact
                disabled={emu.status === 'loading'}
                onFile={emu.launchFile}
                onDemo={emu.launchDemo}
              />
              <button type="button" className="btn btn--ghost" onClick={() => setPeerOpen(true)}>
                2P
              </button>
              {sessionMode === 'coop' && peerPlaying && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={coop.stateSyncBusy || emu.status === 'loading'}
                  onClick={() => void coop.syncGameState().catch(() => {})}
                  title={isHost ? 'Send save state to peer' : 'Fetch save state from host'}
                >
                  {coop.stateSyncBusy ? 'Syncing…' : 'Sync state'}
                </button>
              )}
              {emu.status === 'paused' ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={emu.resume}
                  disabled={peer.phase === 'ready-wait'}
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={emu.pause}
                  disabled={emu.status !== 'running'}
                >
                  Pause
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={emu.restart}
                disabled={emu.status === 'loading' || peerPlaying}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void emu.saveState()}
                disabled={emu.status !== 'running' && emu.status !== 'paused'}
              >
                Save
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void emu.loadState()}
                disabled={emu.status !== 'running' && emu.status !== 'paused'}
              >
                Load
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={emu.toggleFastForward}
                disabled={emu.status !== 'running' || peerPlaying}
              >
                FF
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => void toggleFullscreen()}>
                {isFullscreen ? 'Exit FS' : 'Fullscreen'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
              {showVirtual && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setLayoutEditorOpen(true)}
                  disabled={emu.status === 'loading'}
                >
                  Pad layout
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={handleExitGame}>
                Exit
              </button>
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
        onMaxPlayersChange={setHostMaxPlayers}
        roster={peer.roster}
        connectedGuestCount={peer.connectedGuestCount}
      />

      {showLanding && (
        <footer className="site-footer">
          <button type="button" className="btn btn--text" onClick={() => setSettingsOpen(true)}>
            Advanced settings
          </button>
          <button type="button" className="btn btn--text" onClick={() => setControllersOpen(true)}>
            Controllers
          </button>
          <button type="button" className="btn btn--text" onClick={() => setPeerOpen(true)}>
            Play with Friends
          </button>
          <span>Powered by Nostalgist · ROMs are not distributed</span>
        </footer>
      )}
    </div>
  )
}
