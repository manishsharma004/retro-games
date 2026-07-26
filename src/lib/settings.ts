export type ShaderOption = '' | 'crt/crt-easymode'

export interface EmulatorSettings {
  shader: ShaderOption
  videoSmooth: boolean
  videoVsync: boolean
  rewindEnable: boolean
  audioMute: boolean
  audioVolume: number
  showVirtualController: boolean | 'auto'
  virtualDpadMode: 'dpad' | 'stick'
  virtualControlsOverlay: boolean
  virtualControlsSize: 'small' | 'medium' | 'large'
  virtualControlsOpacity: number
  swapAB: boolean
  allowOpposingDirections: boolean
  frameSkip: number
  integerScale: boolean
  nesRegion: 'Auto' | 'NTSC' | 'PAL'
  nesTurbo: 'None' | 'Both' | 'Player 1' | 'Player 2'
  snesRegion: 'auto' | 'ntsc' | 'pal'
}

export const DEFAULT_SETTINGS: EmulatorSettings = {
  shader: '',
  videoSmooth: false,
  videoVsync: true,
  rewindEnable: false,
  audioMute: false,
  audioVolume: 80,
  showVirtualController: 'auto',
  virtualDpadMode: 'dpad',
  virtualControlsOverlay: false,
  virtualControlsSize: 'medium',
  virtualControlsOpacity: 0.5,
  swapAB: false,
  allowOpposingDirections: true,
  frameSkip: 0,
  integerScale: false,
  nesRegion: 'Auto',
  nesTurbo: 'None',
  snesRegion: 'auto',
}

const STORAGE_KEY = 'retro-games-settings-v1'

export function loadSettings(): EmulatorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: EmulatorSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** Player-2 RetroArch binds for Nostalgist pressDown({ button, player: 2 }).
 * Uses Digit keys via RetroArch `keypad*` names (not `num*`, which map wrong). */
const PLAYER2_BINDS: Record<string, string> = {
  input_player2_up: 'i',
  input_player2_down: 'k',
  input_player2_left: 'j',
  input_player2_right: 'l',
  input_player2_b: 'n',
  input_player2_a: 'm',
  input_player2_y: 'u',
  input_player2_x: 'o',
  input_player2_l: 'c',
  input_player2_r: 'v',
  input_player2_start: 'p',
  input_player2_select: 'semicolon',
}

export function buildRetroarchConfig(settings: EmulatorSettings): Record<string, string | number | boolean> {
  // RetroArch audio_volume is in dB; map 0–100% → -80–0 dB
  const volumeDb = (settings.audioVolume / 100) * 80 - 80

  return {
    input_enable_hotkeys: false,
    rewind_enable: settings.rewindEnable,
    video_smooth: settings.videoSmooth,
    video_vsync: settings.videoVsync,
    video_frame_delay: 0,
    video_shader_enable: Boolean(settings.shader),
    fastforward_frameskip: settings.frameSkip > 0,
    video_font_enable: false,
    video_scale_integer: settings.integerScale,
    aspect_ratio_index: 22, // Core provided
    audio_mute_enable: settings.audioMute,
    audio_volume: volumeDb,
    // Slightly higher latency reduces WebAudio underrun hiccups on the main thread.
    audio_latency: 128,
    // Thumbnails force PNG encode on the Emscripten main thread and freeze play
    // for multiple seconds on Save. Nostalgist also defaults this to true.
    savestate_thumbnail_enable: false,
    savestate_auto_save: false,
    savestate_auto_load: false,
    // Disable periodic SRAM flush (can stall the WASM loop for seconds).
    autosave_interval: '0',
    // Avoid unexpected pause/resume hitch when the tab briefly loses focus.
    pause_nonactive: false,
    menu_driver: 'null',
    notice_show: false,
    // Keep RetroArch's default Z/X/arrow binds. useKeyboardControls claims
    // those keys (stopPropagation) and drives them via pressDown/pressUp,
    // which synthesizes the same default key codes.
    ...PLAYER2_BINDS,
  }
}

export function buildCoreConfig(
  system: 'nes' | 'snes',
  settings: EmulatorSettings,
): Record<string, string> {
  // Allow pressing Up+Down / Left+Right at once for reliable simultaneous
  // multi-key / diagonal input. Both cores disable this by default.
  const upDownAllowed = settings.allowOpposingDirections ? 'enabled' : 'disabled'

  if (system === 'nes') {
    return {
      fceumm_region: settings.nesRegion,
      fceumm_turbo_enable: settings.nesTurbo,
      fceumm_up_down_allowed: upDownAllowed,
    }
  }
  return {
    snes9x_region: settings.snesRegion,
    snes9x_up_down_allowed: upDownAllowed,
  }
}
