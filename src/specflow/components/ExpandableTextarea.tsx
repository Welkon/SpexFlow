import { useEffect, useState } from 'react'
import { TextEditorModal } from './TextEditorModal'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  rows?: number
  placeholder?: string
  expandTitle?: string
  doneLabel?: string
  hintSave?: string
  closeTitle?: string
  openToken?: number | null
}

export function ExpandableTextarea({
  label,
  value,
  onChange,
  disabled,
  rows = 5,
  placeholder,
  expandTitle = 'Open in larger editor',
  doneLabel,
  hintSave,
  closeTitle,
  openToken,
}: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (openToken === null || openToken === undefined) return
    setIsModalOpen(true)
  }, [openToken])

  return (
    <>
      <div className="sfFieldGroup">
        <div className="sfFieldHeader">
          <label className="sfFieldLabel">{label}</label>
          <button
            className="sfExpandBtn"
            onClick={() => setIsModalOpen(true)}
            disabled={disabled}
            title={expandTitle}
          >
            <ExpandIcon />
          </button>
        </div>
        <textarea
          className="sfTextarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={rows}
          placeholder={placeholder}
        />
      </div>

      <TextEditorModal
        isOpen={isModalOpen}
        title={label}
        value={value}
        onChange={onChange}
        onClose={() => setIsModalOpen(false)}
        disabled={disabled}
        placeholder={placeholder}
        doneLabel={doneLabel}
        hintSave={hintSave}
        closeTitle={closeTitle}
      />
    </>
  )
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}
