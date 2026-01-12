import { useEffect } from 'react'
import { useModalBackdropClose } from '../hooks/useModalBackdropClose'

type Props = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  const { handleBackdropClick, contentMouseHandlers } = useModalBackdropClose(onCancel)

  if (!isOpen) return null

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent" {...contentMouseHandlers}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">{title}</span>
          <button className="sfModalCloseBtn" onClick={onCancel} title="Close (Esc)">
            ×
          </button>
        </div>
        <div style={{ padding: '16px 20px', fontSize: 13, lineHeight: 1.4 }}>{message}</div>
        <div className="sfModalFooter">
          <span className="sfModalHint" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sfCancelBtn" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button className="sfModalSaveBtn" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
