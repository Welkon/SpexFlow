import { useEffect, useMemo } from 'react'
import type { ArchivedMember } from '../types'
import { useModalBackdropClose } from '../hooks/useModalBackdropClose'

type Props = {
  isOpen: boolean
  member: ArchivedMember | null
  onClose: () => void
  onUnarchive: (memberId: string) => void
}

export function ArchivedMemberModal({ isOpen, member, onClose, onUnarchive }: Props) {
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const snapshotText = useMemo(() => {
    if (!member) return ''
    return JSON.stringify(member.snapshot ?? {}, null, 2)
  }, [member])

  const { handleBackdropClick, contentMouseHandlers } = useModalBackdropClose(onClose)

  if (!isOpen) return null

  const title = member ? `${member.customName || member.title} (${member.type})` : 'Archived Member'

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent" {...contentMouseHandlers}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">{title}</span>
          <button className="sfModalCloseBtn" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </div>

        {member ? (
          <div style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
            <div>
              <b>Original ID:</b> {member.id}
            </div>
            <div>
              <b>Status:</b> {member.status}
            </div>
            <div>
              <b>Archived At:</b> {new Date(member.archivedAt).toLocaleString()}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, marginBottom: 10, opacity: 0.7 }}>No member selected</div>
        )}

        <pre className="sfOutputViewerContent">{snapshotText}</pre>

        <div className="sfModalFooter">
          <span className="sfModalHint">Press Escape or click outside to close</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="sfModalSaveBtn"
              onClick={() => {
                if (!member) return
                onUnarchive(member.id)
              }}
              disabled={!member}
            >
              Unarchive
            </button>
            <button className="sfModalSaveBtn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
