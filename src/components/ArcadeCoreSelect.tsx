import {
  ARCADE_CORE_AUTO,
  NOSTALGIST_CORES,
  arcadeCoreOptionLabel,
  arcadeCoreSettingLabel,
  isArcadeCoreAuto,
} from '../lib/cores'

interface ArcadeCoreSelectProps {
  value: string
  disabled?: boolean
  id?: string
  onChange: (core: string) => void
  /** Optional hint shown when Auto is selected. */
  autoHint?: string
}

export function ArcadeCoreSelect({
  value,
  disabled,
  id,
  onChange,
  autoHint = 'Auto: KOV2/PGM → FB Alpha 2012; most other .zip → MAME 2003-Plus.',
}: ArcadeCoreSelectProps) {
  return (
    <>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value={ARCADE_CORE_AUTO}>{arcadeCoreSettingLabel(ARCADE_CORE_AUTO)}</option>
        {NOSTALGIST_CORES.map((core) => (
          <option key={core.id} value={core.id}>
            {arcadeCoreOptionLabel(core)}
          </option>
        ))}
      </select>
      {isArcadeCoreAuto(value) && autoHint ? (
        <p className="settings-hint settings-hint--tight">{autoHint}</p>
      ) : null}
    </>
  )
}
