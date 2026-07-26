import { useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedSettings } from './components/AdvancedSettings'
import { EmulatorScreen } from './components/EmulatorScreen'
import { GamepadStatus } from './components/GamepadStatus'
import { RomLoader } from './components/RomLoader'
import { VirtualController } from './components/VirtualController'
import { useEmulator } from './hooks/useEmulator'
import { useFullscreen } from './hooks/useFullscreen'
import { useGamepads } from './hooks/useGamepads'
import { loadSettings, saveSettings, type EmulatorSettings } from './lib/settings'
import './styles/app.css'

function prefersTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

export default function App() {
  const [settings, setSettings] = useState<EmulatorSettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [touchDevice] = useState(() => prefersTouch())
  const shellRef = useRef<HTMLDivElement>(null)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef)
  const pads = useGamepads()

  const emu = useEmulator(settings)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const showVirtual = useMemo(() => {
    if (settings.showVirtualController === 'auto') return touchDevice
    return settings.showVirtualController
  }, [settings.showVirtualController, touchDevice])

  const isPlaying = emu.status === 'running' || emu.status === 'paused' || emu.status === 'loading'
  const showLanding = !isPlaying

  return (
    <div className={`app ${isPlaying ? 'app--playing' : 'app--landing'}`}>
      <div className="atmosphere" aria-hidden="true" />

      {showLanding && (
        <header className="hero">
          <p className="hero__brand">Retro Games</p>
          <h1 className="hero__tagline">Play NES &amp; SNES ROMs in your browser</h1>
          <p className="hero__sub">
            Local files only. Controllers welcome — desktop, mobile, or on-screen.
          </p>
          <RomLoader
            disabled={emu.status === 'loading'}
            onFile={emu.launchFile}
            onDemo={emu.launchDemo}
          />
          {emu.error && <p className="hero__error">{emu.error}</p>}
        </header>
      )}

      {/* Canvas must stay mounted so Nostalgist can attach on launch */}
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
            </div>
            <div className="toolbar__actions">
              <RomLoader
                compact
                disabled={emu.status === 'loading'}
                onFile={emu.launchFile}
                onDemo={emu.launchDemo}
              />
              {emu.status === 'paused' ? (
                <button type="button" className="btn btn--ghost" onClick={emu.resume}>
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
                disabled={emu.status === 'loading'}
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
                disabled={emu.status !== 'running'}
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
            <GamepadStatus pads={pads} />
          </div>
        )}

        <EmulatorScreen
          canvasRef={emu.canvasRef}
          shellRef={shellRef}
          system={emu.game?.system ?? null}
          status={emu.status}
        >
          {emu.game && isPlaying && (
            <VirtualController
              system={emu.game.system}
              onPress={emu.pressDown}
              onRelease={emu.pressUp}
              visible={showVirtual && emu.status !== 'loading'}
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
      />

      {showLanding && (
        <footer className="site-footer">
          <button type="button" className="btn btn--text" onClick={() => setSettingsOpen(true)}>
            Advanced settings
          </button>
          <span>Powered by Nostalgist · ROMs are not distributed</span>
        </footer>
      )}
    </div>
  )
}
