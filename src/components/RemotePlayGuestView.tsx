import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedSettings } from './AdvancedSettings'
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
import {
  loadControllerBindings,
  saveControllerBindings,
  type ControllerBindings,
} from '../lib/gamepad'
import { loadSettings, saveSettings, type EmulatorSettings } from '../lib/settings'

function prefersTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

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
  const playerRef = useRef<HTMLDivElement>(null)
  const {
    isFullscreen,
    cssFallback,
    toggle: toggleFullscreen,
    exit: exitFullscreen,
  } = useFullscreen(playerRef)
  const pads = useGamepads()
  const isLandscape = useLandscape()

  const peerPlaying = peer.phase === 'playing'
  const peerActive = peer.role !== null && peer.phase !== 'idle' && peer.phase !== 'error'
  const localSeat = peer.seat === 1 || peer.seat === 2 ? peer.seat : null
  const showSeatPicker = peer.connectionState === 'connected' && !peerPlaying

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
    peerPlaying && !settingsOpen && !controllersOpen && !layoutEditorOpen

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

  usePreventGameTouchGestures(playerRef, peerPlaying)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveControllerBindings(controllerBindings)
  }, [controllerBindings])

  const streamDetail =
    peer.latencyProfile.streamFps < 60 ? `${peer.latencyProfile.streamFps} FPS stream` : null

  return (
    <div className="app app--playing">
      <div className="atmosphere" aria-hidden="true" />

      <div
        ref={playerRef}
        className={[
          'player',
          isFullscreen && 'player--fullscreen',
          cssFallback && 'player--fullscreen-faux',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {minimalFs ? (
          <>
            <PlayHud
              className="play-hud--corner"
              fps={null}
              latencyProfile={peer.latencyProfile}
              peerConnected={peer.connectionState === 'connected'}
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
        ) : (
          <div className="toolbar">
            <div className="toolbar__left">
              <span className="toolbar__brand">Retro Games</span>
              <span className="toolbar__rom" title={`Room ${roomCode}`}>
                Remote · room {roomCode}
              </span>
              {peer.role && (
                <>
                  <span className="toolbar__peer" title="Remote play session">
                    remote · P{peer.seat ?? '—'} · {peer.phase}
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
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setGameSystem((s) => (s === 'nes' ? 'snes' : 'nes'))}
                title="Switch on-screen pad layout (NES / SNES)"
              >
                {gameSystem.toUpperCase()}
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
            <GamepadStatus pads={pads} onOpen={() => setControllersOpen(true)} />
          </div>
        )}

        {showSeatPicker && (
          <div className="join-page__seats remote-guest__seats" role="radiogroup" aria-label="Player slot">
            <p className="join-page__label">Your controller</p>
            {([1, 2] as const).map((player) => {
              const taken = !peer.isSeatAvailable(player)
              const checked = peer.seat === player
              return (
                <label key={player} className="join-page__seat">
                  <input
                    type="radio"
                    name="remote-player-slot"
                    checked={checked}
                    disabled={taken && !checked}
                    onChange={() => peer.pickSeat(player)}
                  />
                  <span>
                    Player {player}
                    {checked ? ' (you)' : ''}
                    {taken && !checked ? ' (taken)' : ''}
                  </span>
                </label>
              )
            })}
            {peer.remoteSeat && peer.seat && peer.remoteSeat !== peer.seat && (
              <p className="join-page__hint">Host is Player {peer.remoteSeat}.</p>
            )}
          </div>
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
            {!remoteGuest.hasVideo && peer.connectionState === 'connected' && (
              <div className="play-overlay">
                <p>Waiting for host video stream…</p>
              </div>
            )}
            {remoteGuest.needsTap && (
              <div className="play-overlay">
                <button type="button" className="btn btn--primary" onClick={remoteGuest.unmute}>
                  Tap to start video
                </button>
              </div>
            )}
            {peerPlaying && showVirtual && effectivePadOverlay && !layoutEditorOpen && (
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
          {peerPlaying && showVirtual && !effectivePadOverlay && !layoutEditorOpen && (
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
      </div>

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
        onPickSeat={peer.connectionState === 'connected' ? peer.pickSeat : undefined}
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
