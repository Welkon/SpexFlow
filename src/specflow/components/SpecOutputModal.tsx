import { useEffect, useMemo } from 'react'
import type { SpecRunResult } from '../types'
import type { Language } from '../../../shared/appDataTypes'
import { t } from '../i18n'
import { CopyButton } from './CopyButton'

type SpecOutputModalProps = {
  isOpen: boolean
  result: SpecRunResult | null
  onClose: () => void
  language: Language
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString()
}

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return '--'
  const start = new Date(startedAt).getTime()
  const end = new Date(finishedAt).getTime()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s`
}

export function SpecOutputModal({ isOpen, result, onClose, language }: SpecOutputModalProps) {
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const outputEntries = useMemo(() => {
    if (!result) return []
    return Object.entries(result.outputs)
  }, [result])

  if (!isOpen || !result) return null

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent">
        <div className="sfModalHeader">
          <span className="sfModalTitle">{t(language, 'spec_outputs')}</span>
          <button className="sfModalCloseBtn" onClick={onClose} title={t(language, 'modal_close_esc')}>
            ×
          </button>
        </div>
        <div className="sfSpecEditor">
          <div className="sfSpecHistoryTime">
            {t(language, 'spec_run_at')}: {formatTimestamp(result.startedAt)}
          </div>
          <div className="sfSpecHistoryDuration">
            {t(language, 'spec_duration')}: {formatDuration(result.startedAt, result.finishedAt)}
          </div>
          {result.error && (
            <div className="sfSpecNodeRef sfSpecNodeRef--deleted" style={{ marginTop: 8 }}>
              {result.error}
            </div>
          )}
          <div className="sfSpecOutputs" style={{ marginTop: 16 }}>
            {outputEntries.length === 0 ? (
              <div className="sfSpecEmpty">{t(language, 'spec_no_outputs')}</div>
            ) : (
              outputEntries.map(([label, content]) => (
                <details key={label} className="sfSpecOutputSection" open>
                  <summary className="sfSpecOutputHeader">
                    <span>{label}</span>
                    <CopyButton
                      getText={() => content}
                      label={t(language, 'sidebar_copy')}
                      copiedLabel={t(language, 'sidebar_copied')}
                      titleCopy={t(language, 'sidebar_copy_title')}
                      titleCopied={t(language, 'sidebar_copied_title')}
                    />
                  </summary>
                  <div className="sfSpecOutputContent">{content || ''}</div>
                </details>
              ))
            )}
          </div>
        </div>
        <div className="sfModalFooter">
          <span className="sfModalHint">{t(language, 'output_hint_close')}</span>
          <button className="sfModalSaveBtn" onClick={onClose}>
            {t(language, 'close')}
          </button>
        </div>
      </div>
    </div>
  )
}
