import {
  ARCADE_CORE_AUTO,
  ARCADE_CORE_CHOICES,
  arcadeCoreSettingLabel,
  isArcadeCoreAuto,
  isNostalgistCore,
} from '../lib/cores'

interface ArcadeCoreSelectProps {
  value: string
  disabled?: boolean
  id?: string
  onChange: (core: string) => void
}

export function ArcadeCoreSelect({ value, disabled, id, onChange }: ArcadeCoreSelectProps) {
  const known = isArcadeCoreAuto(value) || ARCADE_CORE_CHOICES.some((choice) => choice.id === value)

  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value={ARCADE_CORE_AUTO}>{arcadeCoreSettingLabel(ARCADE_CORE_AUTO)}</option>
      {ARCADE_CORE_CHOICES.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.title} — {choice.detail}
        </option>
      ))}
      {!known && isNostalgistCore(value) && (
        <option value={value}>{arcadeCoreSettingLabel(value)}</option>
      )}
    </select>
  )
}
