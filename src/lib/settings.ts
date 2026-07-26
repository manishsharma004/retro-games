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

export function buildRetroarchConfig(settings: EmulatorSettings): Record<string, string | number | boolean> {
  // RetroArch audio_volume is in dB; map 0–100% → -80–0 dB
  const volumeDb = (settings.audioVolume / 100) * 80 - 80

  return {
    input_enable_hotkeys: false,
    rewind_enable: settings.rewindEnable,
    video_smooth: settings.videoSmooth,
    video_vsync: settings.videoVsync,
    video_frame_delay: 0,
    fastforward_frameskip: settings.frameSkip > 0,
    video_font_enable: false,
    video_scale_integer: settings.integerScale,
    aspect_ratio_index: 22, // Core provided
    audio_mute_enable: settings.audioMute,
    audio_volume: volumeDb,
    savestate_thumbnail_enable: true,
    menu_driver: 'null',
    notice_show: false,
    // Keep RetroArch's default Z/X/arrow binds. useKeyboardControls claims
    // those keys (stopPropagation) and drives them via pressDown/pressUp,
    // which synthesizes the same default key codes.
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
