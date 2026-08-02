import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedSettings } from './AdvancedSettings'
import { PeerConnectionStatus } from './PeerConnectionStatus'
import { ControllerPanel } from './ControllerPanel'
import { GamepadStatus } from './GamepadStatus'
import { LatencyBadge } from './LatencyBadge'
import { PlayHud } from './PlayHud'
import { VirtualController } from './VirtualController'
import { VirtualLayoutEditor } from './VirtualLayoutEditor'
import type { UseRemoteGuestResult } from '../hooks/multiplayer/useRemoteGuest'
import { useFullscreen } from '../hooks/useFullscreen'
import { useGamepadControls } from '../hooks/useGamepadControls'
import { useGamepads } from '../hooks/useGamepads'
import { useKeyboardControls } from '../hooks/useKeyboardControls'
import { useLandscape } from '../hooks/useLandscape'
import { usePreventGameTouchGestures } from '../hooks/usePreventGameTouchGestures'
import type { UsePeerSessionResult } from '../hooks/usePeerSession'
import type { SystemId } from '../lib/cores'
import { GuestRolePicker } from './GuestRolePicker'
import {
  loadControllerBindings,
  saveControllerBindings,
  type ControllerBindings,
} from '../lib/gamepad'
import { loadSettings, saveSettings, type EmulatorSettings } from '../lib/settings'

function prefersTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

const REMOTE_AUTO_FS_KEY = 'retro-games-remote-auto-fs'

interface RemotePlayGuestViewProps {
  peer: UsePeerSessionResult
  remoteGuest: UseRemoteGuestResult
  roomCode: string
  onLeave: () => void
}

export function RemotePlayGuestView({
  peer,
  remoteGuest,
  roomCode,
  onLeave,
}: RemotePlayGuestViewProps) {
  const [settings, setSettings] = useState<EmulatorSettings>(() => loadSettings())
  const [controllerBindings, setControllerBindings] = useState<ControllerBindings>(() =>
    loadControllerBindings(),
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [controllersOpen, setControllersOpen] = useState(false)
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false)
  const [gameSystem, setGameSystem] = useState<SystemId>('nes')
  const [touchDevice] = useState(() => prefersTouch())
  const [autoFullscreen, setAutoFullscreen] = useState(
    () => sessionStorage.getItem(REMOTE_AUTO_FS_KEY) === '1',
  )
  const [fsPromptOpen, setFsPromptOpen] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const {
    isFullscreen,
    cssFallback,
    enter: enterFullscreen,
    toggle: toggleFullscreen,
    exit: exitFullscreen,
  } = useFullscreen(playerRef)
  const pads = useGamepads()
  const isLandscape = useLandscape()

  const peerPlaying = peer.phase === 'playing'
  const peerActive = peer.role !== null && peer.phase !== 'idle' && peer.phase !== 'error'
  const localSeat = peer.seat
  const isSpectator = peer.seat === null
  const joining =
    (peer.phase === 'connecting' ||
      peer.phase === 'guest-answer' ||
      peer.connectionState === 'connecting') &&
    !peer.connectionLost &&
    peer.connectionState !== 'disconnected' &&
    peer.connectionState !== 'failed'
  const showRolePicker =
    peer.role === 'guest' && peer.phase !== 'idle' && peer.phase !== 'error' && !isFullscreen
  const rolePickerInOverlay = showRolePicker && joining

  const showVirtual = useMemo(() => {
    if (settings.showVirtualController === 'auto') return touchDevice
    return settings.showVirtualController
  }, [settings.showVirtualController, touchDevice])

  const padOverlay = settings.virtualControlsOverlay || isLandscape
  const effectivePadOverlay = padOverlay || isFullscreen
  const minimalFs = isFullscreen

  const onPress = useCallback((button: string) => remoteGuest.onPress(button), [remoteGuest])
  const onRelease = useCallback((button: string) => remoteGuest.onRelease(button), [remoteGuest])

  const onPadPress = useCallback(
    (button: string, player: number) => {
      if (localSeat !== null && player !== localSeat) return
      onPress(button)
    },
    [localSeat, onPress],
  )

  const onPadRelease = useCallback(
    (button: string, player: number) => {
      if (localSeat !== null && player !== localSeat) return
      onRelease(button)
    },
    [localSeat, onRelease],
  )

  const inputEnabled =
    peerPlaying &&
    !isSpectator &&
    !settingsOpen &&
    !controllersOpen &&
    !layoutEditorOpen

  useKeyboardControls({
    enabled: inputEnabled,
    onPress,
    onRelease,
  })

  useGamepadControls({
    enabled: inputEnabled,
    bindings: controllerBindings,
    peerSeat: localSeat,
    onPress: onPadPress,
    onRelease: onPadRelease,
  })

  usePreventGameTouchGestures(playerRef, peerPlaying || isFullscreen)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveControllerBindings(controllerBindings)
  }, [controllerBindings])

  useEffect(() => {
    sessionStorage.setItem(REMOTE_AUTO_FS_KEY, autoFullscreen ? '1' : '0')
  }, [autoFullscreen])

  useEffect(() => {
    if (remoteGuest.hasVideo) peer.clearHostNotice()
  }, [remoteGuest.hasVideo, peer.clearHostNotice])

  useEffect(() => {
    if (!peerPlaying || !remoteGuest.hasVideo || isFullscreen) return
    if (autoFullscreen && touchDevice) {
      void enterFullscreen()
      return
    }
    if (touchDevice) setFsPromptOpen(true)
  }, [peerPlaying, remoteGuest.hasVideo, isFullscreen, autoFullscreen, touchDevice, enterFullscreen])

  const streamDetail =
    peer.latencyProfile.streamFps < 60 ? `${peer.latencyProfile.streamFps} FPS stream` : null

  return (
    <div
      ref={playerRef}
      className={[
        'app',
        'app--playing',
        'player',
        isFullscreen && 'player--fullscreen',
        cssFallback && 'player--fullscreen-faux',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="atmosphere" aria-hidden="true" />

      {minimalFs ? (
        <>
          <PlayHud
            className="play-hud--corner"
            fps={null}
            latencyProfile={peer.latencyProfile}
            peerConnected={peer.connectionState === 'connected'}
          />
          <div className="fs-corner-actions">
            <button
              type="button"
              className="fs-corner-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
            >
              ⚙
            </button>
            {showVirtual && (
              <button
                type="button"
                className="fs-corner-btn"
                onClick={() => setLayoutEditorOpen(true)}
                aria-label="Pad layout"
                title="Pad layout"
              >
                ⊞
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
      ) : (
        <div className="toolbar">
          <div className="toolbar__left">
            <span className="toolbar__brand">Retro Games</span>
            <span className="toolbar__rom" title={`Room ${roomCode}`}>
              Remote · room {roomCode}
              {peer.hostGame ? ` · ${peer.hostGame.name}` : ''}
            </span>
            {peer.role && (
              <>
                <span className="toolbar__peer" title="Remote play session">
                  remote · {isSpectator ? 'spectator' : `P${peer.seat}`} · {peer.phase}
                </span>
                <LatencyBadge
                  profile={peer.latencyProfile}
                  connected={peer.connectionState === 'connected'}
                  detail={streamDetail}
                />
              </>
            )}
          </div>
          <div className="toolbar__actions">
            {(peer.connectionLost || peer.error) && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void peer.reconnectSession()}
              >
                Reconnect
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setGameSystem((s) => (s === 'nes' ? 'snes' : 'nes'))}
              title="Switch on-screen pad layout (NES / SNES)"
            >
              {gameSystem.toUpperCase()}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void toggleFullscreen()}>
              Fullscreen
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
            {showVirtual && !isSpectator && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setLayoutEditorOpen(true)}
              >
                Pad layout
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                peer.disconnect()
                exitFullscreen()
                onLeave()
              }}
            >
              Leave
            </button>
          </div>
          <GamepadStatus
            pads={isSpectator ? [] : pads}
            onOpen={isSpectator ? undefined : () => setControllersOpen(true)}
          />
        </div>
      )}

      {showRolePicker && !rolePickerInOverlay && (
        <GuestRolePicker peer={peer} name="remote-player-slot" className="remote-guest__seats" />
      )}

        <div
          className={`play-shell ${effectivePadOverlay ? 'play-shell--pad-overlay' : 'play-shell--docked'}`}
        >
          <div
            className={`play-stage${effectivePadOverlay ? ' play-stage--pad-overlay' : ''}`}
            style={effectivePadOverlay ? undefined : { aspectRatio: '4 / 3' }}
          >
            <video
              ref={remoteGuest.videoRef}
              className="play-canvas remote-guest__video"
              autoPlay
              playsInline
              muted
            />
            <PeerConnectionStatus
              roomCode={roomCode}
              phase={peer.phase}
              connectionState={peer.connectionState}
              connectionLost={peer.connectionLost}
              error={peer.error}
              hasVideo={remoteGuest.hasVideo}
              hostGameName={peer.hostGame?.name ?? null}
              sessionMode="remote"
              connectivityHint={peer.connectivityHint}
              onReconnect={() => peer.reconnectSession()}
              onLeave={() => {
                peer.disconnect()
                exitFullscreen()
                onLeave()
              }}
            >
              {rolePickerInOverlay && (
                <GuestRolePicker
                  peer={peer}
                  name="remote-player-slot-overlay"
                  className="remote-guest__seats remote-guest__seats--overlay"
                  compact
                />
              )}
            </PeerConnectionStatus>
            {!isFullscreen && remoteGuest.hasVideo && (
              <button
                type="button"
                className="fs-enter-btn"
                onClick={() => {
                  setFsPromptOpen(false)
                  void enterFullscreen()
                }}
                aria-label="Enter fullscreen"
                title="Enter fullscreen"
              >
                ⛶
              </button>
            )}
            {fsPromptOpen && !isFullscreen && remoteGuest.hasVideo && (
              <div className="play-overlay play-overlay--dim remote-guest__fs-prompt">
                <p className="play-overlay__title">Fullscreen available</p>
                <p>Use the corner button or toolbar to enter fullscreen.</p>
                <div className="remote-guest__fs-prompt-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      setFsPromptOpen(false)
                      void enterFullscreen()
                    }}
                  >
                    Enter fullscreen
                  </button>
                  <label className="remote-guest__auto-fs">
                    <input
                      type="checkbox"
                      checked={autoFullscreen}
                      onChange={(e) => setAutoFullscreen(e.target.checked)}
                    />
                    Always start fullscreen
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setFsPromptOpen(false)}
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}
            {!remoteGuest.hasVideo && peer.connectionState === 'connected' && (
              <div className="play-overlay">
                <p>Waiting for host video stream…</p>
              </div>
            )}
            {peer.error === 'Host ended the game' && !peer.hostGame && (
              <div className="play-overlay play-overlay--dim">
                <p className="play-overlay__title">Host ended the game</p>
                <p>Waiting for the host to load a new ROM…</p>
              </div>
            )}
            {remoteGuest.needsTap && (
              <div className="play-overlay">
                <button type="button" className="btn btn--primary" onClick={remoteGuest.unmute}>
                  Tap to start video & audio
                </button>
              </div>
            )}
            {peerPlaying && showVirtual && !isSpectator && effectivePadOverlay && !layoutEditorOpen && (
              <VirtualController
                system={gameSystem}
                onPress={onPress}
                onRelease={onRelease}
                visible
                dpadMode={settings.virtualDpadMode}
                overlay
                size={settings.virtualControlsSize}
                scaleBoost={isLandscape ? 1 : 1.4}
                opacity={settings.virtualControlsOpacity}
                layout={settings.virtualControlsLayout}
              />
            )}
          </div>
          {peerPlaying && showVirtual && !isSpectator && !effectivePadOverlay && !layoutEditorOpen && (
            <VirtualController
              system={gameSystem}
              onPress={onPress}
              onRelease={onRelease}
              visible
              dpadMode={settings.virtualDpadMode}
              overlay={false}
              size={settings.virtualControlsSize}
              scaleBoost={isLandscape ? 1 : 1.4}
              opacity={settings.virtualControlsOpacity}
              layout={settings.virtualControlsLayout}
            />
          )}
        </div>

        {peer.error && <p className="player__error">{peer.error}</p>}

      <AdvancedSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        system={gameSystem}
        isRunning={peerPlaying}
        onApplyRelaunch={() => setSettingsOpen(false)}
        gameName="Remote stream"
        gamepadCount={pads.length}
        remoteGuest
        autoFullscreen={autoFullscreen}
        onAutoFullscreenChange={setAutoFullscreen}
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
        peerSeat={peerActive && localSeat ? localSeat : null}
        remoteSeat={peerActive ? peer.remoteSeat : null}
        onPickRole={peer.connectionState === 'connected' ? peer.pickRole : undefined}
        onPickSeat={peer.connectionState === 'connected' ? peer.pickSeat : undefined}
        remoteSpectator={peer.remoteSpectator}
        isSeatAvailable={
          peer.connectionState === 'connected' ? peer.isSeatAvailable : undefined
        }
      />

      {peerPlaying && layoutEditorOpen && (
        <VirtualLayoutEditor
          open={layoutEditorOpen}
          system={gameSystem}
          layout={settings.virtualControlsLayout}
          dpadMode={settings.virtualDpadMode}
          size={settings.virtualControlsSize}
          opacity={settings.virtualControlsOpacity}
          gameName="Remote stream"
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
    </div>
  )
}
