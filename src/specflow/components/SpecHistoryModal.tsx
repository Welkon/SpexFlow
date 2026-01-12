import { useEffect } from 'react'
import type { Spec, SpecRunResult } from '../types'
import type { Language } from '../../../shared/appDataTypes'
import { t } from '../i18n'
import { useModalBackdropClose } from '../hooks/useModalBackdropClose'

type SpecHistoryModalProps = {
  isOpen: boolean
  spec: Spec
  onClose: () => void
  onSelectRun: (result: SpecRunResult) => void
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

export function SpecHistoryModal({ isOpen, spec, onClose, onSelectRun, language }: SpecHistoryModalProps) {
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const { handleBackdropClick, contentMouseHandlers } = useModalBackdropClose(onClose)

  if (!isOpen) return null

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent" {...contentMouseHandlers}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">{t(language, 'spec_run_history')}</span>
          <button className="sfModalCloseBtn" onClick={onClose} title={t(language, 'modal_close_esc')}>
            ×
          </button>
        </div>
        <div className="sfSpecEditor">
          {spec.runHistory.length === 0 ? (
            <div className="sfSpecEmpty">{t(language, 'spec_no_history')}</div>
          ) : (
            <div className="sfSpecHistoryList">
              {spec.runHistory.map((result) => {
                const outputsCount = Object.keys(result.outputs).length
                return (
                  <div
                    key={result.runId}
                    className="sfSpecHistoryItem"
                    onClick={() => onSelectRun(result)}
                  >
                    <div>
                      <div className="sfSpecHistoryTime">
                        {t(language, 'spec_run_at')}: {formatTimestamp(result.startedAt)}
                      </div>
                      {result.error && (
                        <div className="sfSpecNodeRef sfSpecNodeRef--deleted">{result.error}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div className="sfSpecHistoryDuration">
                        {t(language, 'spec_duration')}: {formatDuration(result.startedAt, result.finishedAt)}
                      </div>
                      <div className="sfSpecHistoryOutputCount">{outputsCount}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
