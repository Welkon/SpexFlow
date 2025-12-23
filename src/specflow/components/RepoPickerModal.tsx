import { useEffect, useMemo, useState } from 'react'
import type { ManualImportItem } from '../../../shared/appDataTypes'
import type { Language } from '../../../shared/appDataTypes'
import { listRepoDir } from '../api'
import { t } from '../i18n'

type DirEntry = {
  kind: 'file' | 'dir'
  name: string
  relPath: string
}

type Props = {
  isOpen: boolean
  repoPath: string
  language: Language
  initialItems: ManualImportItem[]
  onConfirm: (items: ManualImportItem[]) => void
  onClose: () => void
  disabled?: boolean
}

function posixDirname(relPath: string) {
  const s = relPath.replaceAll('\\', '/').replace(/^\/+/, '').trim()
  if (!s) return ''
  const parts = s.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function posixBasename(relPath: string) {
  const s = relPath.replaceAll('\\', '/').replace(/^\/+/, '').trim()
  if (!s) return ''
  const parts = s.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function joinPosix(a: string, b: string) {
  const left = a.replaceAll('\\', '/').replace(/^\/+/, '').trim()
  const right = b.replaceAll('\\', '/').replace(/^\/+/, '').trim()
  if (!left) return right
  if (!right) return left
  return `${left}/${right}`
}

export function RepoPickerModal({ isOpen, repoPath, language, initialItems, onConfirm, onClose, disabled }: Props) {
  const [dir, setDir] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [trustedExtensions, setTrustedExtensions] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [selected, setSelected] = useState<Record<string, ManualImportItem>>({})

  useEffect(() => {
    if (!isOpen) return
    const next: Record<string, ManualImportItem> = {}
    for (const item of initialItems ?? []) {
      if (!item?.relPath) continue
      next[item.relPath] = item
    }
    setSelected(next)
    setDir('')
    setFilter('')
    setError(null)
  }, [isOpen, initialItems])

  useEffect(() => {
    if (!isOpen) return
    if (!repoPath.trim()) {
      setEntries([])
      setTrustedExtensions([])
      setError(t(language, 'manual_import_repo_required'))
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    listRepoDir({ repoPath, dir, signal: controller.signal })
      .then((data) => {
        setEntries(data.entries)
        setTrustedExtensions(data.trustedExtensions)
      })
      .catch((e) => {
        setEntries([])
        setTrustedExtensions([])
        setError(String((e as Error)?.message ?? e))
      })
      .finally(() => {
        setLoading(false)
      })
    return () => controller.abort()
  }, [isOpen, repoPath, dir, language])

  const breadcrumbs = useMemo(() => {
    const parts = dir ? dir.split('/').filter(Boolean) : []
    const out: Array<{ label: string; dir: string }> = [{ label: t(language, 'manual_import_root'), dir: '' }]
    let acc = ''
    for (const p of parts) {
      acc = joinPosix(acc, p)
      out.push({ label: p, dir: acc })
    }
    return out
  }, [dir, language])

  const parentDir = useMemo(() => posixDirname(dir), [dir])

  const visibleEntries = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(q))
  }, [entries, filter])

  if (!isOpen) return null

  function toggleItem(item: ManualImportItem) {
    if (disabled) return
    setSelected((prev) => {
      const next = { ...prev }
      if (next[item.relPath]) {
        delete next[item.relPath]
      } else {
        next[item.relPath] = item
      }
      return next
    })
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const selectedItems = Object.values(selected).sort((a, b) => a.relPath.localeCompare(b.relPath))

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent" style={{ width: 820, maxWidth: '92vw' }}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">{t(language, 'manual_import_pick_title')}</span>
          <button className="sfModalCloseBtn" onClick={onClose} title={t(language, 'close')}>
            ×
          </button>
        </div>

        <div style={{ padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="sfTab"
            style={{ padding: '4px 10px', cursor: parentDir !== dir ? 'pointer' : 'not-allowed', opacity: parentDir !== dir ? 1 : 0.5 }}
            disabled={parentDir === dir}
            onClick={() => setDir(parentDir)}
            title={t(language, 'manual_import_up')}
          >
            ← {t(language, 'manual_import_up')}
          </button>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {breadcrumbs.map((b, idx) => (
              <button
                key={`${b.dir}_${idx}`}
                className="sfTab"
                style={{ padding: '4px 8px', cursor: 'pointer' }}
                onClick={() => setDir(b.dir)}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <input
            className="sfInput"
            style={{ width: 280 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t(language, 'manual_import_filter_placeholder')}
          />
        </div>

        <div style={{ padding: '0 16px 12px 16px', fontSize: 12, opacity: 0.85 }}>
          {t(language, 'manual_import_trusted_exts')}: {trustedExtensions.join(' ')}
        </div>

        {error ? (
          <div style={{ padding: '0 16px 12px 16px', color: '#b00020' }}>{error}</div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, padding: '0 16px 16px 16px' }}>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', fontSize: 12, opacity: 0.9 }}>
              {loading ? t(language, 'manual_import_loading') : t(language, 'manual_import_entries')}
            </div>
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {visibleEntries.length === 0 ? (
                <div style={{ padding: 10, fontSize: 12, opacity: 0.75 }}>
                  {t(language, 'manual_import_empty_dir')}
                </div>
              ) : null}

              {visibleEntries.map((e) => {
                const checked = !!selected[e.relPath]
                const isDir = e.kind === 'dir'
                return (
                  <div
                    key={e.relPath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderBottom: '1px solid #f3f3f3',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleItem({ kind: e.kind, relPath: e.relPath })}
                    />
                    <button
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: isDir ? 'pointer' : 'default',
                        color: isDir ? '#0060df' : 'inherit',
                        textAlign: 'left',
                        flex: 1,
                      }}
                      onClick={() => {
                        if (!isDir) return
                        setDir(e.relPath)
                      }}
                      title={e.relPath}
                    >
                      {isDir ? '📁 ' : '📄 '}
                      {e.name}
                    </button>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{e.kind}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', fontSize: 12, opacity: 0.9 }}>
              {t(language, 'manual_import_selected')} ({selectedItems.length})
            </div>
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {selectedItems.length === 0 ? (
                <div style={{ padding: 10, fontSize: 12, opacity: 0.75 }}>
                  {t(language, 'manual_import_selected_empty')}
                </div>
              ) : null}
              {selectedItems.map((item) => (
                <div
                  key={item.relPath}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderBottom: '1px solid #f3f3f3',
                  }}
                >
                  <span style={{ width: 18 }}>{item.kind === 'dir' ? '📁' : '📄'}</span>
                  <span style={{ fontSize: 12, flex: 1 }} title={item.relPath}>
                    {posixBasename(item.relPath) || item.relPath}
                    <span style={{ opacity: 0.6 }}> — {posixDirname(item.relPath) || '.'}</span>
                  </span>
                  <button
                    className="sfRemoveBtn"
                    onClick={() => toggleItem(item)}
                    title={t(language, 'manual_import_remove')}
                    disabled={disabled}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sfModalFooter">
          <span className="sfModalHint">{t(language, 'manual_import_dir_note')}</span>
          <button className="sfCancelBtn" onClick={onClose}>
            {t(language, 'cancel')}
          </button>
          <button
            className="sfSaveBtn"
            onClick={() => onConfirm(selectedItems)}
            disabled={disabled || selectedItems.length === 0}
          >
            {t(language, 'manual_import_done')}
          </button>
        </div>
      </div>
    </div>
  )
}
