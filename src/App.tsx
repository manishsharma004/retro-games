import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedSettings } from './components/AdvancedSettings'
import { ControllerPanel } from './components/ControllerPanel'
import { EmulatorScreen } from './components/EmulatorScreen'
import { GamepadStatus } from './components/GamepadStatus'
import { PeerLobby } from './components/PeerLobby'
import { RomLoader } from './components/RomLoader'
import { VirtualController } from './components/VirtualController'
import { useEmulator } from './hooks/useEmulator'
import { useFullscreen } from './hooks/useFullscreen'
import { useGamepadControls } from './hooks/useGamepadControls'
import { useGamepads } from './hooks/useGamepads'
import { useKeyboardControls } from './hooks/useKeyboardControls'
import { usePeerSession } from './hooks/usePeerSession'
import {
  loadControllerBindings,
  saveControllerBindings,
  type ControllerBindings,
} from './lib/gamepad'
import { fetchLibrary, romUrl, type LibraryRom } from './lib/library'
import { loadSettings, saveSettings, type EmulatorSettings } from './lib/settings'
import './styles/app.css'

const RESYNC_INTERVAL_MS = 3500

function prefersTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

export default function App() {
  const [settings, setSettings] = useState<EmulatorSettings>(() => loadSettings())
  const [controllerBindings, setControllerBindings] = useState<ControllerBindings>(() =>
    loadControllerBindings(),
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [peerOpen, setPeerOpen] = useState(false)
  const [controllersOpen, setControllersOpen] = useState(false)
  const [touchDevice] = useState(() => prefersTouch())
  const [library, setLibrary] = useState<LibraryRom[]>([])
  const autoLoadedRef = useRef(false)
  const skipAutoLoadRef = useRef(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef)
  const pads = useGamepads()

  const emu = useEmulator(settings)
  const { launchLibrary } = emu

  const resyncRequestHandlerRef = useRef<() => void>(() => {})

  const handleRemoteInput = useCallback(
    (seat: 1 | 2, button: string, down: boolean) => {
      if (down) emu.remotePressDown(button, seat)
      else emu.remotePressUp(button, seat)
    },
    [emu],
  )

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
      setSettings((prev) => ({
        ...prev,
        swapAB: payload.settings.swapAB ?? prev.swapAB,
        allowOpposingDirections:
          payload.settings.allowOpposingDirections ?? prev.allowOpposingDirections,
        nesRegion: payload.settings.nesRegion ?? prev.nesRegion,
        nesTurbo: payload.settings.nesTurbo ?? prev.nesTurbo,
        snesRegion: payload.settings.snesRegion ?? prev.snesRegion,
        frameSkip: payload.settings.frameSkip ?? prev.frameSkip,
        rewindEnable: payload.settings.rewindEnable ?? prev.rewindEnable,
      }))
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

  const handleGo = useCallback(() => {
    emu.resume()
  }, [emu])

  const handleResyncState = useCallback(
    async (state: Uint8Array) => {
      await emu.importStateBlob(
        new Blob([
          state.buffer.slice(state.byteOffset, state.byteOffset + state.byteLength) as ArrayBuffer,
        ]),
      )
    },
    [emu],
  )

  const peer = usePeerSession({
    settings,
    onRemoteInput: handleRemoteInput,
    onBootstrap: handleBootstrap,
    onGo: handleGo,
    onResyncState: handleResyncState,
    onResyncRequest: () => resyncRequestHandlerRef.current(),
  })

  const peerRef = useRef(peer)
  peerRef.current = peer

  resyncRequestHandlerRef.current = () => {
    void (async () => {
      if (peerRef.current.role !== 'host') return
      const blob = await emu.exportStateBlob()
      if (!blob) return
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await peerRef.current.sendResyncState(bytes)
    })()
  }

  const localSeat = peer.seat ?? 1
  const peerPlaying = peer.phase === 'playing'
  const peerLinked = peer.role !== null && peer.phase !== 'idle' && peer.phase !== 'error'

  const onLocalPress = useCallback(
    (button: string) => {
      emu.pressDown(button, localSeat)
      if (peerPlaying) peer.sendInput(button, true)
    },
    [emu, localSeat, peer, peerPlaying],
  )

  const onLocalRelease = useCallback(
    (button: string) => {
      emu.pressUp(button, localSeat)
      if (peerPlaying) peer.sendInput(button, false)
    },
    [emu, localSeat, peer, peerPlaying],
  )

  const onPadPress = useCallback(
    (button: string, player: number) => {
      emu.pressDown(button, player)
      if (peerPlaying && player === localSeat) peer.sendInput(button, true)
    },
    [emu, localSeat, peer, peerPlaying],
  )

  const onPadRelease = useCallback(
    (button: string, player: number) => {
      emu.pressUp(button, player)
      if (peerPlaying && player === localSeat) peer.sendInput(button, false)
    },
    [emu, localSeat, peer, peerPlaying],
  )

  const inputEnabled =
    (emu.status === 'running' || emu.status === 'paused') &&
    !settingsOpen &&
    !peerOpen &&
    !controllersOpen

  useKeyboardControls({
    enabled: inputEnabled,
    onPress: onLocalPress,
    onRelease: onLocalRelease,
  })

  useGamepadControls({
    enabled: inputEnabled,
    bindings: controllerBindings,
    peerSeat: peerLinked ? localSeat : null,
    onPress: onPadPress,
    onRelease: onPadRelease,
  })

  useEffect(() => {
    if (peer.role === 'guest') {
      skipAutoLoadRef.current = true
      autoLoadedRef.current = true
    }
  }, [peer.role])

  useEffect(() => {
    if (peer.phase !== 'playing' || peer.role !== 'host') return
    const id = window.setInterval(() => {
      void (async () => {
        const blob = await emu.exportStateBlob()
        if (!blob) return
        const bytes = new Uint8Array(await blob.arrayBuffer())
        await peerRef.current.sendResyncState(bytes)
      })()
    }, RESYNC_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [peer.phase, peer.role, emu])

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

  const showVirtual = useMemo(() => {
    if (settings.showVirtualController === 'auto') return touchDevice
    return settings.showVirtualController
  }, [settings.showVirtualController, touchDevice])

  const isPlaying = emu.status === 'running' || emu.status === 'paused' || emu.status === 'loading'
  const showLanding = !isPlaying

  const canHostShareGame = Boolean(
    peer.role === 'host' &&
      peer.connectionState === 'connected' &&
      emu.game &&
      (emu.status === 'running' || emu.status === 'paused') &&
      (emu.game.file || emu.game.source === 'demo' || emu.game.source === 'library'),
  )

  const emuReadyForPeer = emu.status === 'running' || emu.status === 'paused'

  const shareGameWithPeer = useCallback(async () => {
    if (peer.role !== 'host' || !emu.game) throw new Error('Host must have a game loaded')
    emu.pause()
    let rom = await emu.getRomBytes()
    if (!rom && emu.game.source === 'demo') {
      const res = await fetch(romUrl('flappybird.nes'))
      if (!res.ok) throw new Error('Could not fetch demo ROM for peer share')
      rom = new Uint8Array(await res.arrayBuffer())
    }
    if (!rom) throw new Error('ROM bytes unavailable — load a local or library ROM')
    const stateBlob = await emu.exportStateBlob()
    if (!stateBlob) throw new Error('Could not capture save state')
    const state = new Uint8Array(await stateBlob.arrayBuffer())
    await peer.sendBootstrap({
      name: emu.game.name,
      system: emu.game.system,
      core: emu.game.core,
      rom,
      state,
      libraryFile: emu.game.libraryFile,
    })
  }, [emu, peer])

  return (
    <div className={`app ${isPlaying ? 'app--playing' : 'app--landing'}`}>
      <div className="atmosphere" aria-hidden="true" />

      {showLanding && (
        <header className="hero">
          <p className="hero__brand">Retro Games</p>
          <h1 className="hero__tagline">Play NES &amp; SNES ROMs in your browser</h1>
          <p className="hero__sub">
            Local files only. Controllers welcome — desktop, mobile, or on-screen. Link two devices
            for 2-player over WebRTC.
          </p>
          <RomLoader
            disabled={emu.status === 'loading'}
            onFile={emu.launchFile}
            onDemo={emu.launchDemo}
          />
          <div className="hero__peer">
            <button type="button" className="btn btn--primary" onClick={() => setPeerOpen(true)}>
              2 Player
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

      <div className={isPlaying ? 'player' : 'player player--parked'} aria-hidden={!isPlaying}>
        {isPlaying && (
          <div className={`toolbar ${isFullscreen ? 'toolbar--overlay' : ''}`}>
            <div className="toolbar__left">
              <span className="toolbar__brand">Retro Games</span>
              {emu.game && (
                <span className="toolbar__rom" title={emu.game.name}>
                  {emu.game.system.toUpperCase()} · {emu.game.name}
                </span>
              )}
              {peer.role && (
                <span className="toolbar__peer" title="2-player session">
                  2P · P{peer.seat} · {peer.phase}
                </span>
              )}
            </div>
            <div className="toolbar__actions">
              <RomLoader
                compact
                disabled={emu.status === 'loading' || peerPlaying}
                onFile={emu.launchFile}
                onDemo={emu.launchDemo}
              />
              <button type="button" className="btn btn--ghost" onClick={() => setPeerOpen(true)}>
                2P
              </button>
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
              <button type="button" className="btn btn--ghost" onClick={emu.exit}>
                Exit
              </button>
            </div>
            <GamepadStatus pads={pads} onOpen={() => setControllersOpen(true)} />
          </div>
        )}

        <EmulatorScreen
          canvasRef={emu.canvasRef}
          shellRef={shellRef}
          system={emu.game?.system ?? null}
          status={emu.status}
          isFullscreen={isFullscreen}
        >
          {emu.game && isPlaying && (
            <VirtualController
              system={emu.game.system}
              onPress={onLocalPress}
              onRelease={onLocalRelease}
              visible={showVirtual && emu.status !== 'loading'}
              dpadMode={settings.virtualDpadMode}
              overlay={settings.virtualControlsOverlay}
              size={settings.virtualControlsSize}
              opacity={settings.virtualControlsOpacity}
            />
          )}
        </EmulatorScreen>

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
      />

      <ControllerPanel
        open={controllersOpen}
        onClose={() => setControllersOpen(false)}
        pads={pads}
        bindings={controllerBindings}
        onChange={setControllerBindings}
        peerSeat={peerLinked ? localSeat : null}
      />

      <PeerLobby
        open={peerOpen}
        onClose={() => setPeerOpen(false)}
        phase={peer.phase}
        role={peer.role}
        seat={peer.seat}
        connectionState={peer.connectionState}
        localSignal={peer.localSignal}
        transfer={peer.transfer}
        error={peer.error}
        remoteReady={peer.remoteReady}
        canHostShareGame={canHostShareGame}
        emuReady={emuReadyForPeer}
        onCreateHost={() => peer.createHostOffer()}
        onAcceptAnswer={(answer) => peer.acceptGuestAnswer(answer)}
        onJoinOffer={(offer) => peer.joinWithOffer(offer)}
        onShareGame={() => shareGameWithPeer()}
        onReady={() => peer.sendReady()}
        onGo={() => peer.sendGo()}
        onResync={async () => {
          const blob = await emu.exportStateBlob()
          if (!blob) throw new Error('No state to push')
          await peer.sendResyncState(new Uint8Array(await blob.arrayBuffer()))
        }}
        onRequestResync={() => peer.requestResync()}
        onDisconnect={() => peer.disconnect()}
        onOpenControllers={() => {
          setPeerOpen(false)
          setControllersOpen(true)
        }}
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
            2 Player
          </button>
          <span>Powered by Nostalgist · ROMs are not distributed</span>
        </footer>
      )}
    </div>
  )
}
