import type { ReactNode } from 'react'
import { useModalBackdropClose } from '../hooks/useModalBackdropClose'

type Props = {
  isOpen: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  closeTitle?: string
}

export function SettingsModalShell({ isOpen, title, onClose, children, footer, closeTitle = 'Close' }: Props) {
  const { handleBackdropClick, contentMouseHandlers } = useModalBackdropClose(onClose)

  if (!isOpen) return null

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfSettingsModal" {...contentMouseHandlers}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">{title}</span>
          <button className="sfModalCloseBtn" onClick={onClose} title={closeTitle}>
            ×
          </button>
        </div>
        {children}
        {footer ? <div className="sfModalFooter">{footer}</div> : null}
      </div>
    </div>
  )
}
