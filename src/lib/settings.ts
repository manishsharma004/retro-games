import { DEFAULT_LAYOUT, sanitizeLayout, type VirtualControlsLayout } from './virtualLayout'

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
  virtualControlsLayout: VirtualControlsLayout
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
  virtualControlsLayout: DEFAULT_LAYOUT,
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
    const parsed = JSON.parse(raw) as Partial<EmulatorSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      virtualControlsLayout: sanitizeLayout(parsed.virtualControlsLayout),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: EmulatorSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** NTSC content rate — both co-op emulators must match. */
export const COOP_REFRESH_RATE_HZ = 60
export const COOP_AUDIO_LATENCY_MS = 128

/** Lock gameplay settings so both peers run the same content framerate. */
export function coopTimingSettings(settings: EmulatorSettings): EmulatorSettings {
  return {
    ...settings,
    videoVsync: false,
    frameSkip: 0,
    rewindEnable: false,
    nesRegion: 'NTSC',
    snesRegion: 'ntsc',
  }
}

export interface RetroarchConfigOptions {
  /** Dual-emulator co-op: audio-synced 60 Hz, no display vsync. */
  coop?: boolean
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

export function buildRetroarchConfig(
  settings: EmulatorSettings,
  options?: RetroarchConfigOptions,
): Record<string, string | number | boolean> {
  const effective = options?.coop ? coopTimingSettings(settings) : settings
  // RetroArch audio_volume is in dB; map 0–100% → -80–0 dB
  const volumeDb = (effective.audioVolume / 100) * 80 - 80

  const base: Record<string, string | number | boolean> = {
    input_enable_hotkeys: false,
    rewind_enable: effective.rewindEnable,
    video_smooth: effective.videoSmooth,
    video_vsync: effective.videoVsync,
    video_frame_delay: 0,
    video_shader_enable: Boolean(effective.shader),
    fastforward_frameskip: effective.frameSkip > 0,
    video_font_enable: false,
    video_scale_integer: effective.integerScale,
    aspect_ratio_index: 22, // Core provided
    audio_mute_enable: effective.audioMute,
    audio_volume: volumeDb,
    audio_latency: COOP_AUDIO_LATENCY_MS,
    savestate_thumbnail_enable: false,
    savestate_auto_save: false,
    savestate_auto_load: false,
    autosave_interval: '0',
    pause_nonactive: false,
    menu_driver: 'null',
    notice_show: false,
    input_player1_joypad_index: 99,
    input_player2_joypad_index: 99,
    input_libretro_device_p1: 1,
    input_libretro_device_p2: 1,
    ...PLAYER2_BINDS,
  }

  if (options?.coop) {
    return {
      ...base,
      audio_sync: true,
      video_vsync: false,
      fastforward_frameskip: false,
      fastforward_ratio: 1,
      video_refresh_rate: COOP_REFRESH_RATE_HZ,
      audio_latency: COOP_AUDIO_LATENCY_MS,
      rewind_enable: false,
      pause_nonactive: true,
    }
  }

  return base
}

export function buildCoreConfig(
  system: 'nes' | 'snes',
  settings: EmulatorSettings,
  options?: RetroarchConfigOptions,
): Record<string, string> {
  const effective = options?.coop ? coopTimingSettings(settings) : settings
  const upDownAllowed = effective.allowOpposingDirections ? 'enabled' : 'disabled'

  if (system === 'nes') {
    return {
      fceumm_region: effective.nesRegion,
      fceumm_turbo_enable: effective.nesTurbo,
      fceumm_up_down_allowed: upDownAllowed,
    }
  }
  return {
    snes9x_region: effective.snesRegion,
    snes9x_up_down_allowed: upDownAllowed,
  }
}
