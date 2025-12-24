import { useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SpecRunResult, AppNode } from '../types'
import type { Language } from '../../../shared/appDataTypes'
import { t } from '../i18n'
import { CopyButton } from './CopyButton'

type SpecOutputModalProps = {
  isOpen: boolean
  result: SpecRunResult | null
  outputTypes?: Record<string, AppNode['type']>
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

export function SpecOutputModal({ isOpen, result, outputTypes, onClose, language }: SpecOutputModalProps) {
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
      <div className="sfModalContent sfSpecOutputModal">
        <div className="sfModalHeader">
          <div>
            <span className="sfModalTitle">{t(language, 'spec_outputs')}</span>
            <div className="sfSpecHeaderMeta">
              <span>{t(language, 'spec_run_at')}: {formatTimestamp(result.startedAt)}</span>
              <span>{t(language, 'spec_duration')}: {formatDuration(result.startedAt, result.finishedAt)}</span>
            </div>
          </div>
          <button className="sfModalCloseBtn" onClick={onClose} title={t(language, 'modal_close_esc')}>
            ×
          </button>
        </div>
        <div className="sfSpecEditor">
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
                  {outputTypes?.[label] === 'llm' ? (
                    <div className="sfSpecOutputContent sfMarkdownContent">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="sfSpecOutputContent">{content || ''}</div>
                  )}
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
