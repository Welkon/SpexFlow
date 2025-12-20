import { useRef } from 'react'
import type { ReactNode, MouseEvent } from 'react'

type Props = {
  isOpen: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  closeTitle?: string
}

export function SettingsModalShell({ isOpen, title, onClose, children, footer, closeTitle = 'Close' }: Props) {
  const mouseDownInsideRef = useRef(false)

  if (!isOpen) return null

  function handleBackdropClick(e: MouseEvent) {
    if (mouseDownInsideRef.current) {
      mouseDownInsideRef.current = false
      return
    }
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div
        className="sfSettingsModal"
        onMouseDown={() => {
          mouseDownInsideRef.current = true
        }}
        onMouseUp={() => {
          mouseDownInsideRef.current = false
        }}
      >
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
