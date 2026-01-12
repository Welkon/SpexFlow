import { useEffect, useRef, useState } from 'react'
import { useModalBackdropClose } from '../hooks/useModalBackdropClose'

type Props = {
  isOpen: boolean
  title: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  disabled?: boolean
  placeholder?: string
  doneLabel?: string
  hintSave?: string
  closeTitle?: string
}

export function TextEditorModal({
  isOpen,
  title,
  value,
  onChange,
  onClose,
  disabled,
  placeholder,
  doneLabel = 'Done',
  hintSave = 'Press Escape or click outside to save and close',
  closeTitle = 'Close (Esc)',
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [localValue, setLocalValue] = useState(value)

  // Sync local value when modal opens or external value changes
  useEffect(() => {
    if (isOpen) {
      setLocalValue(value)
    }
  }, [isOpen, value])

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [isOpen])

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleSave()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, localValue])

  function handleSave() {
    onChange(localValue)
    onClose()
  }

  const { handleBackdropClick, contentMouseHandlers } = useModalBackdropClose(handleSave)

  if (!isOpen) return null

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent" {...contentMouseHandlers}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">{title}</span>
          <button className="sfModalCloseBtn" onClick={handleSave} title={closeTitle}>
            ×
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="sfModalTextarea"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
        <div className="sfModalFooter">
          <span className="sfModalHint">{hintSave}</span>
          <button className="sfModalSaveBtn" onClick={handleSave}>
            {doneLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
