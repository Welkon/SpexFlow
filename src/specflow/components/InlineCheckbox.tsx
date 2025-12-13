type Props = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function InlineCheckbox({ label, checked, onChange, disabled }: Props) {
  return (
    <label className="sfInlineCheckbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="sfCheckboxLabel">{label}</span>
    </label>
  )
}
