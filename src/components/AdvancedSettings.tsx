import type { EmulatorSettings, ShaderOption } from '../lib/settings'
import type { SystemId } from '../lib/cores'

interface AdvancedSettingsProps {
  open: boolean
  onClose: () => void
  settings: EmulatorSettings
  onChange: (next: EmulatorSettings) => void
  system: SystemId | null
  isRunning: boolean
  onApplyRelaunch: () => void
  gameName?: string | null
  coreName?: string | null
  gamepadCount: number
}

export function AdvancedSettings({
  open,
  onClose,
  settings,
  onChange,
  system,
  isRunning,
  onApplyRelaunch,
  gameName,
  coreName,
  gamepadCount,
}: AdvancedSettingsProps) {
  if (!open) return null

  const patch = <K extends keyof EmulatorSettings>(key: K, value: EmulatorSettings[K]) => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <aside
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Advanced emulator settings"
      >
        <header className="settings-panel__header">
          <h2>Advanced settings</h2>
          <button type="button" className="btn btn--icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="settings-panel__body">
          <section className="settings-section">
            <h3>Video</h3>
            <label className="field">
              <span>Shader</span>
              <select
                value={settings.shader}
                onChange={(e) => patch('shader', e.target.value as ShaderOption)}
              >
                <option value="">None</option>
                <option value="crt/crt-easymode">CRT Easy Mode</option>
              </select>
            </label>
            <label className="field field--row">
              <span>Smooth scaling</span>
              <input
                type="checkbox"
                checked={settings.videoSmooth}
                onChange={(e) => patch('videoSmooth', e.target.checked)}
              />
            </label>
            <label className="field field--row">
              <span>Integer scale</span>
              <input
                type="checkbox"
                checked={settings.integerScale}
                onChange={(e) => patch('integerScale', e.target.checked)}
              />
            </label>
            <label className="field field--row">
              <span>VSync</span>
              <input
                type="checkbox"
                checked={settings.videoVsync}
                onChange={(e) => patch('videoVsync', e.target.checked)}
              />
            </label>
            <label className="field">
              <span>Frame skip hint</span>
              <input
                type="range"
                min={0}
                max={4}
                value={settings.frameSkip}
                onChange={(e) => patch('frameSkip', Number(e.target.value))}
              />
              <em>{settings.frameSkip === 0 ? 'Off' : settings.frameSkip}</em>
            </label>
          </section>

          <section className="settings-section">
            <h3>Audio</h3>
            <label className="field field--row">
              <span>Mute</span>
              <input
                type="checkbox"
                checked={settings.audioMute}
                onChange={(e) => patch('audioMute', e.target.checked)}
              />
            </label>
            <label className="field">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.audioVolume}
                disabled={settings.audioMute}
                onChange={(e) => patch('audioVolume', Number(e.target.value))}
              />
              <em>{settings.audioVolume}%</em>
            </label>
          </section>

          <section className="settings-section">
            <h3>Gameplay</h3>
            <label className="field field--row">
              <span>Rewind</span>
              <input
                type="checkbox"
                checked={settings.rewindEnable}
                onChange={(e) => patch('rewindEnable', e.target.checked)}
              />
            </label>
            <p className="settings-hint">Rewind uses more memory. Apply &amp; relaunch after changing.</p>
          </section>

          <section className="settings-section">
            <h3>Input</h3>
            <label className="field">
              <span>Virtual controller</span>
              <select
                value={String(settings.showVirtualController)}
                onChange={(e) => {
                  const v = e.target.value
                  patch(
                    'showVirtualController',
                    v === 'auto' ? 'auto' : v === 'true',
                  )
                }}
              >
                <option value="auto">Auto (touch devices)</option>
                <option value="true">Always show</option>
                <option value="false">Hide</option>
              </select>
            </label>
            <label className="field">
              <span>Directional control</span>
              <select
                value={settings.virtualDpadMode}
                onChange={(e) =>
                  patch('virtualDpadMode', e.target.value as EmulatorSettings['virtualDpadMode'])
                }
              >
                <option value="dpad">D-pad (buttons)</option>
                <option value="stick">Analog stick (one thumb)</option>
              </select>
            </label>
            <label className="field field--row">
              <span>Overlay controls on screen</span>
              <input
                type="checkbox"
                checked={settings.virtualControlsOverlay}
                onChange={(e) => patch('virtualControlsOverlay', e.target.checked)}
              />
            </label>
            <p className="settings-hint">
              Overlay floats semi-transparent controls over the game so the full screen is used for
              display.
            </p>
            <label className="field field--row">
              <span>Swap A/B (and X/Y)</span>
              <input
                type="checkbox"
                checked={settings.swapAB}
                onChange={(e) => patch('swapAB', e.target.checked)}
              />
            </label>
            <label className="field field--row">
              <span>Allow opposing directions</span>
              <input
                type="checkbox"
                checked={settings.allowOpposingDirections}
                onChange={(e) => patch('allowOpposingDirections', e.target.checked)}
              />
            </label>
            <p className="settings-hint">
              Enables simultaneous Up+Down / Left+Right. Apply &amp; relaunch after changing.
            </p>
            <div className="keyboard-hints">
              <strong>Keyboard</strong>
              <ul>
                <li>D-Pad: Arrow keys</li>
                <li>B / A: Z / X</li>
                <li>Y / X (SNES): A / S</li>
                <li>Start / Select: Enter / Shift</li>
              </ul>
            </div>
          </section>

          {(system === 'nes' || !system) && (
            <section className="settings-section">
              <h3>NES core (fceumm)</h3>
              <label className="field">
                <span>Region</span>
                <select
                  value={settings.nesRegion}
                  onChange={(e) =>
                    patch('nesRegion', e.target.value as EmulatorSettings['nesRegion'])
                  }
                >
                  <option value="Auto">Auto</option>
                  <option value="NTSC">NTSC</option>
                  <option value="PAL">PAL</option>
                </select>
              </label>
              <label className="field">
                <span>Turbo</span>
                <select
                  value={settings.nesTurbo}
                  onChange={(e) =>
                    patch('nesTurbo', e.target.value as EmulatorSettings['nesTurbo'])
                  }
                >
                  <option value="None">None</option>
                  <option value="Both">Both</option>
                  <option value="Player 1">Player 1</option>
                  <option value="Player 2">Player 2</option>
                </select>
              </label>
            </section>
          )}

          {(system === 'snes' || !system) && (
            <section className="settings-section">
              <h3>SNES core (snes9x)</h3>
              <label className="field">
                <span>Region</span>
                <select
                  value={settings.snesRegion}
                  onChange={(e) =>
                    patch('snesRegion', e.target.value as EmulatorSettings['snesRegion'])
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="ntsc">NTSC</option>
                  <option value="pal">PAL</option>
                </select>
              </label>
            </section>
          )}

          <section className="settings-section">
            <h3>System</h3>
            <dl className="settings-meta">
              <div>
                <dt>ROM</dt>
                <dd>{gameName ?? '—'}</dd>
              </div>
              <div>
                <dt>Core</dt>
                <dd>{coreName ?? '—'}</dd>
              </div>
              <div>
                <dt>Gamepads</dt>
                <dd>{gamepadCount}</dd>
              </div>
            </dl>
          </section>
        </div>

        <footer className="settings-panel__footer">
          {isRunning ? (
            <button type="button" className="btn btn--primary" onClick={onApplyRelaunch}>
              Apply &amp; relaunch
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </aside>
    </div>
  )
}
