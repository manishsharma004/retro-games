import type { LatencyProfile } from '../lib/peer'

interface PlayHudProps {
  fps: number | null
  latencyProfile?: LatencyProfile
  peerConnected?: boolean
  className?: string
}

export function PlayHud({
  fps,
  latencyProfile,
  peerConnected = false,
  className,
}: PlayHudProps) {
  const parts: string[] = []
  if (peerConnected && latencyProfile) {
    parts.push(latencyProfile.label)
  }
  if (fps !== null) {
    parts.push(`${fps} FPS`)
  }
  if (!parts.length) return null

  const tier = peerConnected && latencyProfile ? latencyProfile.tier : 'unknown'
  const title = [
    latencyProfile?.advice,
    fps !== null ? `Emulator: ${fps} FPS` : null,
  ]
    .filter(Boolean)
    .join(' ')

  const classes = ['play-hud', `play-hud--${tier}`, className].filter(Boolean).join(' ')

  return (
    <span className={classes} title={title || undefined}>
      {parts.join(' · ')}
    </span>
  )
}
