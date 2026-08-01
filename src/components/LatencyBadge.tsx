import type { LatencyProfile } from '../lib/peer'

interface LatencyBadgeProps {
  profile: LatencyProfile
  connected?: boolean
  className?: string
  showAdvice?: boolean
  /** Extra detail shown after the latency label (e.g. stream FPS). */
  detail?: string | null
}

export function LatencyBadge({
  profile,
  connected = true,
  className,
  showAdvice = false,
  detail,
}: LatencyBadgeProps) {
  if (!connected) return null

  const classes = [
    'latency-badge',
    `latency-badge--${profile.tier}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const title = [
    profile.advice,
    detail,
    profile.warnInputDelay ? 'Controller input may feel delayed.' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} title={title || undefined}>
      <span className="latency-badge__label">{profile.label}</span>
      {detail && <span className="latency-badge__detail">{detail}</span>}
      {showAdvice && profile.advice && (
        <span className="latency-badge__advice">{profile.advice}</span>
      )}
    </span>
  )
}
