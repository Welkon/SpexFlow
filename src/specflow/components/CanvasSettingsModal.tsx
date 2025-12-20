import { useEffect, useState } from 'react'
import type { Tab } from '../types'
import type { Language } from '../../../shared/appDataTypes'
import { t } from '../i18n'
import { SettingsModalShell } from './SettingsModalShell'

type Props = {
  isOpen: boolean
  tab: Tab | null
  language: Language
  onClose: () => void
  onRename: (tabId: string, nextName: string) => Promise<void>
  onDuplicate: (tabId: string, nextName: string) => Promise<void>
  onDelete: (tabId: string) => Promise<void>
  onUpdateSettings: (tabId: string, patch: { defaultRepoPath?: string }) => void
}

export function CanvasSettingsModal({
  isOpen,
  tab,
  language,
  onClose,
  onRename,
  onDuplicate,
  onDelete,
  onUpdateSettings,
}: Props) {
  const [renameValue, setRenameValue] = useState('')
  const [duplicateValue, setDuplicateValue] = useState('')
  const [defaultRepoPath, setDefaultRepoPath] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    if (!isOpen || !tab) return
    setRenameValue(tab.name)
    setDuplicateValue(`${tab.name} Copy`)
    setDefaultRepoPath(tab.canvasSettings?.defaultRepoPath ?? '')
    setIsBusy(false)
  }, [isOpen, tab])

  if (!tab) return null
  const tabId = tab.id

  async function handleRename() {
    if (!renameValue.trim()) return
    setIsBusy(true)
    try {
      await onRename(tabId, renameValue)
      onClose()
    } catch (err) {
      alert(String((err as Error)?.message ?? err))
      setIsBusy(false)
    }
  }

  async function handleDuplicate() {
    if (!duplicateValue.trim()) return
    setIsBusy(true)
    try {
      await onDuplicate(tabId, duplicateValue)
      onClose()
    } catch (err) {
      alert(String((err as Error)?.message ?? err))
      setIsBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(t(language, 'confirm_delete_canvas'))) return
    setIsBusy(true)
    try {
      await onDelete(tabId)
      onClose()
    } catch (err) {
      alert(String((err as Error)?.message ?? err))
      setIsBusy(false)
    }
  }

  return (
    <SettingsModalShell
      isOpen={isOpen}
      title={t(language, 'canvas_settings_title')}
      onClose={onClose}
      closeTitle={t(language, 'close')}
      footer={
        <button className="sfCancelBtn" onClick={onClose}>
          {t(language, 'close')}
        </button>
      }
    >
      <div className="sfSettingsContent">
        <div className="sfFieldGroup">
          <label className="sfFieldLabel">{t(language, 'canvas_name')}</label>
          <div className="sfButtonGroup sfButtonGroup--tight">
            <div className="sfButtonWrap">
              <input
                className="sfInput"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <button className="sfAddBtn" onClick={handleRename} disabled={isBusy}>
              {t(language, 'rename')}
            </button>
          </div>
        </div>

        <div className="sfFieldGroup">
          <label className="sfFieldLabel">{t(language, 'duplicate_canvas_as')}</label>
          <div className="sfButtonGroup sfButtonGroup--tight">
            <div className="sfButtonWrap">
              <input
                className="sfInput"
                value={duplicateValue}
                onChange={(e) => setDuplicateValue(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <button className="sfAddBtn" onClick={handleDuplicate} disabled={isBusy}>
              {t(language, 'duplicate')}
            </button>
          </div>
        </div>

        <div className="sfFieldGroup">
          <label className="sfFieldLabel">{t(language, 'canvas_default_repo_path')}</label>
          <div className="sfButtonGroup sfButtonGroup--tight">
            <div className="sfButtonWrap">
              <input
                className="sfInput"
                value={defaultRepoPath}
                onChange={(e) => setDefaultRepoPath(e.target.value)}
                disabled={isBusy}
                placeholder={t(language, 'placeholder_repo_path')}
              />
            </div>
            <button
              className="sfAddBtn"
              onClick={() => onUpdateSettings(tabId, { defaultRepoPath: defaultRepoPath.trim() })}
              disabled={isBusy}
            >
              {t(language, 'save')}
            </button>
          </div>
        </div>

        <div className="sfSectionDivider" />

        <button className="sfRemoveProviderBtn" onClick={handleDelete} disabled={isBusy}>
          {t(language, 'delete_canvas')}
        </button>
      </div>
    </SettingsModalShell>
  )
}
