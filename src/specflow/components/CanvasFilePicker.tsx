import { useEffect, useState } from 'react'
import type { Language } from '../../../shared/appDataTypes'
import { listCanvasFiles } from '../api'
import { t } from '../i18n'

type CanvasFile = { name: string; path: string; modifiedAt: string }

type CommonProps = {
  isOpen: boolean
  language: Language
  onClose: () => void
}

type LoadProps = CommonProps & {
  mode: 'load'
  onConfirmLoad: (path: string) => void
}

type SaveProps = CommonProps & {
  mode: 'save'
  defaultFileName: string
  onConfirmSave: (fileName: string) => void
}

type Props = LoadProps | SaveProps

export function CanvasFilePicker(props: Props) {
  const { isOpen, language, onClose } = props

  const defaultFileName = props.mode === 'save' ? props.defaultFileName : ''

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<CanvasFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    setError(null)
    listCanvasFiles()
      .then((res) => setFiles(res.files ?? []))
      .catch((e) => setError(String((e as Error)?.message ?? e)))
      .finally(() => setIsLoading(false))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setSelectedPath(null)
    if (props.mode === 'save') setFileName(defaultFileName)
    else setFileName('')
  }, [defaultFileName, isOpen, props.mode])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const title = props.mode === 'save' ? t(language, 'save_canvas_title') : t(language, 'load_canvas_title')

  const canConfirm = props.mode === 'load' ? !!selectedPath : !!fileName.trim()

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleConfirm() {
    if (props.mode === 'load') {
      if (!selectedPath) return
      props.onConfirmLoad(selectedPath)
      return
    }
    const next = fileName.trim()
    if (!next) return
    props.onConfirmSave(next)
  }

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent" style={{ width: 620, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">{title}</span>
          <button className="sfModalCloseBtn" onClick={onClose} title={t(language, 'modal_close_esc')}>
            ×
          </button>
        </div>

        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {props.mode === 'save' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#666' }}>{t(language, 'save_as')}</div>
              <input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={t(language, 'save_canvas_placeholder')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  fontSize: 13,
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#666' }}>{t(language, 'saved_canvases')}</div>
            {isLoading ? <span style={{ fontSize: 12, color: '#888' }}>{t(language, 'manual_import_loading')}</span> : null}
            {error ? <span style={{ fontSize: 12, color: '#b00020' }}>{error}</span> : null}
          </div>

          <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
            {files.length === 0 && !isLoading ? (
              <div style={{ padding: 12, fontSize: 12, color: '#777' }}>{t(language, 'no_saved_canvases')}</div>
            ) : (
              files.map((f) => {
                const isActive = selectedPath === f.path
                return (
                  <button
                    key={f.path}
                    onClick={() => {
                      setSelectedPath(f.path)
                      if (props.mode === 'save') setFileName(f.name)
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      border: 'none',
                      borderTop: '1px solid #f2f2f2',
                      background: isActive ? 'rgba(26, 115, 232, 0.08)' : '#fff',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                    title={f.path}
                  >
                    <span style={{ textAlign: 'left' }}>{f.name}</span>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>{new Date(f.modifiedAt).toLocaleString()}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="sfModalFooter">
          <span className="sfModalHint" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sfCancelBtn" onClick={onClose}>
              {t(language, 'cancel')}
            </button>
            <button className="sfModalSaveBtn" onClick={handleConfirm} disabled={!canConfirm}>
              {props.mode === 'load' ? t(language, 'load') : t(language, 'save_as')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
