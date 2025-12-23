import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CopyButton } from './CopyButton'

type Props = {
  isOpen: boolean
  title: string
  content: string
  onClose: () => void
  closeLabel?: string
  hintClose?: string
  closeTitle?: string
  renderMarkdown?: boolean
  copyLabel?: string
  copiedLabel?: string
  titleCopy?: string
  titleCopied?: string
}

export function OutputViewerModal({
  isOpen,
  title,
  content,
  onClose,
  closeLabel = 'Close',
  hintClose = 'Press Escape or click outside to close',
  closeTitle = 'Close (Esc)',
  renderMarkdown = false,
  copyLabel,
  copiedLabel,
  titleCopy,
  titleCopied,
}: Props) {
  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent">
        <div className="sfModalHeader">
          <span className="sfModalTitle">{title}</span>
          <div className="sfModalHeaderActions">
            <CopyButton
              getText={() => content}
              label={copyLabel}
              copiedLabel={copiedLabel}
              titleCopy={titleCopy}
              titleCopied={titleCopied}
            />
            <button className="sfModalCloseBtn" onClick={onClose} title={closeTitle}>
              ×
            </button>
          </div>
        </div>
        {renderMarkdown ? (
          <div className="sfOutputViewerContent sfMarkdownContent">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="sfOutputViewerContent">{content}</pre>
        )}
        <div className="sfModalFooter">
          <span className="sfModalHint">{hintClose}</span>
          <button className="sfModalSaveBtn" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
