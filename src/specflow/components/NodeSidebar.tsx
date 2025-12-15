import { useCallback, useEffect, useState } from 'react'
import type { AppNode, APISettings } from '../types'
import { resetNodeRuntime } from '../utils'
import { ExpandableTextarea } from './ExpandableTextarea'
import { InlineCheckbox } from './InlineCheckbox'
import { CopyButton } from './CopyButton'
import { ModelSelect } from './ModelSelect'
import { OutputViewerModal } from './OutputViewerModal'
import { RepoPickerModal } from './RepoPickerModal'
import { t } from '../i18n'
import type { ManualImportItem, Language } from '../../../shared/appDataTypes'
import { CodeSearchOutputPreview } from './CodeSearchOutputPreview'

// @@@ isCodeSearchOutput - 类型守卫，判断 output 是否为 code-search 输出格式
const isCodeSearchOutput = (
  output: unknown,
): output is { explanation?: string; files: Record<string, Array<[number, number]>> } => {
  return (
    output !== null &&
    typeof output === 'object' &&
    'files' in output &&
    typeof (output as { files: unknown }).files === 'object'
  )
}

type Props = {
  selectedNode: AppNode | null
  multiSelectCount: number
  patchSelectedNode: (patch: (n: AppNode) => AppNode) => void
  deleteSelectedNodes: () => void
  runNode: (nodeId: string) => void
  runFrom: (nodeId: string) => void
  apiSettings: APISettings
  language: Language
  canRunFromPreds: boolean
}

export function NodeSidebar({
  selectedNode,
  multiSelectCount,
  patchSelectedNode,
  deleteSelectedNodes,
  runNode,
  runFrom,
  apiSettings,
  language,
  canRunFromPreds,
}: Props) {
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [showManualRepoRequired, setShowManualRepoRequired] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const getOutputText = useCallback(() => {
    if (!selectedNode) return ''
    const out = selectedNode.data.output
    if (out === null || out === undefined) return ''
    if (typeof out === 'string') return out
    return JSON.stringify(out, null, 2)
  }, [selectedNode])

  useEffect(() => {
    if (!selectedNode) return
    setIsEditingName(false)
    setNameDraft((selectedNode.data.customName ?? '').trim())
  }, [selectedNode?.id])

  // Multi-select: don't show sidebar (use MultiSelectInfo instead)
  if (multiSelectCount > 1) return null
  if (!selectedNode) return null

  const isLocked = !!selectedNode.data.locked
  const predsBlocked = !canRunFromPreds
  const predsBlockedTitle = predsBlocked
    ? t(language, 'sidebar_predecessors_not_succeeded')
    : undefined
  const customName = (selectedNode.data.customName ?? '').trim()
  const customColor = (selectedNode.data.customColor ?? '').trim()
  const manualRepoPathTrimmed =
    selectedNode.type === 'manual-import' ? (selectedNode.data.repoPath ?? '').trim() : ''

  const outputTitle = t(language, 'sidebar_output')

  return (
    <div className="sfSidebar">
      <div className="sfSidebarContent">
        <div className="sfNodeMetaBlock">
          <div className="sfNodeMetaLine">
            <span className="sfNodeMetaKey">{t(language, 'sidebar_type')}:</span>
            <span className="sfNodeMetaVal" title={selectedNode.type}>
              {selectedNode.type}
            </span>
          </div>

          <div className="sfNodeMetaLine">
            <span className="sfNodeMetaKey">{t(language, 'sidebar_name')}:</span>
            {isEditingName ? (
              <input
                className="sfInlineEditInput"
                value={nameDraft}
                autoFocus
                disabled={isLocked}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsEditingName(false)
                    setNameDraft(customName)
                    return
                  }
                  if (e.key === 'Enter') {
                    const next = nameDraft.trim()
                    patchSelectedNode(
                      (n) =>
                        ({ ...n, data: { ...n.data, customName: next ? next : undefined } }) as AppNode,
                    )
                    setIsEditingName(false)
                  }
                }}
                onBlur={() => {
                  const next = nameDraft.trim()
                  patchSelectedNode(
                    (n) =>
                      ({ ...n, data: { ...n.data, customName: next ? next : undefined } }) as AppNode,
                  )
                  setIsEditingName(false)
                }}
              />
            ) : (
              <button
                type="button"
                className="sfInlineEditBtn"
                disabled={isLocked}
                onClick={() => {
                  if (isLocked) return
                  setNameDraft(customName)
                  setIsEditingName(true)
                }}
                title={t(language, 'sidebar_name_click')}
              >
                {customName ? customName : t(language, 'sidebar_name_click')}
              </button>
            )}
          </div>

          <div className="sfNodeMetaLine">
            <span className="sfNodeMetaKey">{t(language, 'sidebar_color')}:</span>
            <div className="sfColorSwatches">
              {['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#06B6D4', '#EC4899', '#64748B'].map(
                (c) => {
                  const isActive = customColor.toLowerCase() === c.toLowerCase()
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`sfColorSwatch${isActive ? ' sfColorSwatchActive' : ''}`}
                      style={{ background: c }}
                      disabled={isLocked}
                      onClick={() => {
                        if (isLocked) return
                        patchSelectedNode(
                          (n) =>
                            ({
                              ...n,
                              data: { ...n.data, customColor: isActive ? undefined : c },
                            }) as AppNode,
                        )
                      }}
                      title={isActive ? t(language, 'sidebar_color_clear') : c}
                      aria-label={c}
                    />
                  )
                },
              )}
            </div>
          </div>
        </div>

        {/* Lock + Mute toggles */}
        <div className="sfInlineRow sfInlineRowNoWrap">
          <InlineCheckbox
            label={t(language, 'sidebar_locked')}
            checked={isLocked}
            onChange={(checked) =>
              patchSelectedNode((n) => ({ ...n, data: { ...n.data, locked: checked } }) as AppNode)
            }
          />

          <InlineCheckbox
            label={t(language, 'sidebar_muted')}
            checked={!!selectedNode.data.muted}
            onChange={(checked) =>
              patchSelectedNode((n) => ({ ...n, data: { ...n.data, muted: checked } }) as AppNode)
            }
          />
        </div>

        <div className="sfSectionDivider" />

        {/* Code Search Node */}
        {selectedNode.type === 'code-search' && (
          <>
            <div className="sfFieldGroup">
              <label className="sfFieldLabel">{t(language, 'field_repo_path')}</label>
              <input
                className="sfInput"
                value={selectedNode.data.repoPath ?? ''}
                disabled={isLocked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'code-search' ? { ...n, data: { ...n.data, repoPath: e.target.value } } : n,
                  )
                }
                placeholder={t(language, 'placeholder_repo_path')}
              />
            </div>

            <ExpandableTextarea
              label={t(language, 'field_query')}
              value={selectedNode.data.query ?? ''}
              onChange={(value) =>
                patchSelectedNode((n) =>
                  n.type === 'code-search' ? { ...n, data: { ...n.data, query: value } } : n,
                )
              }
              disabled={isLocked}
              rows={5}
              placeholder={t(language, 'placeholder_search_query')}
              expandTitle={t(language, 'editor_expand')}
              doneLabel={t(language, 'editor_done')}
              hintSave={t(language, 'editor_hint_save')}
              closeTitle={t(language, 'modal_close_esc')}
            />

            <InlineCheckbox
              label={t(language, 'field_debug_messages')}
              checked={!!selectedNode.data.debugMessages}
              onChange={(checked) =>
                patchSelectedNode((n) =>
                  n.type === 'code-search' ? { ...n, data: { ...n.data, debugMessages: checked } } : n,
                )
              }
              disabled={isLocked}
            />
          </>
        )}

        {/* Manual Import Node */}
        {selectedNode.type === 'manual-import' && (
          <>
            <div className="sfFieldGroup">
              <label className="sfFieldLabel">{t(language, 'manual_import_repo_path')}</label>
              <input
                className="sfInput"
                value={selectedNode.data.repoPath ?? ''}
                disabled={isLocked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'manual-import' ? { ...n, data: { ...n.data, repoPath: e.target.value } } : n,
                  )
                }
                placeholder={t(language, 'placeholder_repo_path')}
              />
              {!isLocked && showManualRepoRequired && !manualRepoPathTrimmed ? (
                <div style={{ marginTop: 6, fontSize: 12, color: '#b00020' }}>
                  {t(language, 'manual_import_repo_required')}
                </div>
              ) : null}
            </div>

            <div className="sfFieldGroup">
              <label className="sfFieldLabel">{t(language, 'manual_import_selected_items')}</label>
              <button
                className="sfAddBtn"
                onClick={() => {
                  if (isLocked) return
                  if (!manualRepoPathTrimmed) {
                    setShowManualRepoRequired(true)
                    window.alert(t(language, 'manual_import_repo_required'))
                    return
                  }
                  setIsPickerOpen(true)
                }}
                disabled={isLocked}
              >
                {t(language, 'manual_import_pick')}
              </button>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                {t(language, 'manual_import_dir_note')}
              </div>

              <div style={{ marginTop: 10 }}>
                {selectedNode.data.items?.length ? (
                  selectedNode.data.items.map((it: ManualImportItem) => (
                    <div
                      key={`${it.kind}:${it.relPath}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
                    >
                      <span style={{ width: 18 }}>{it.kind === 'dir' ? '📁' : '📄'}</span>
                      <span style={{ fontSize: 12, flex: 1 }} title={it.relPath}>
                        {it.relPath}
                      </span>
                      <button
                        className="sfRemoveBtn"
                        onClick={() =>
                          patchSelectedNode((n) => {
                            if (n.type !== 'manual-import') return n
                            const next = (n.data.items ?? []).filter((x) => !(x.kind === it.kind && x.relPath === it.relPath))
                            return { ...n, data: { ...n.data, items: next } }
                          })
                        }
                        disabled={isLocked}
                        title={t(language, 'manual_import_remove')}
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{t(language, 'manual_import_selected_none')}</div>
                )}
              </div>
            </div>

            <RepoPickerModal
              isOpen={isPickerOpen}
              repoPath={selectedNode.data.repoPath ?? ''}
              language={language}
              initialItems={selectedNode.data.items ?? []}
              onClose={() => setIsPickerOpen(false)}
              onConfirm={(items) => {
                patchSelectedNode((n) =>
                  n.type === 'manual-import' ? { ...n, data: { ...n.data, items } } : n,
                )
                setIsPickerOpen(false)
              }}
            />
          </>
        )}

        {/* Code Search Conductor Node */}
        {selectedNode.type === 'code-search-conductor' && (
          <>
            <ModelSelect
              value={selectedNode.data.model ?? ''}
              onChange={(modelId) =>
                patchSelectedNode((n) =>
                  n.type === 'code-search-conductor' ? { ...n, data: { ...n.data, model: modelId } } : n,
                )
              }
              settings={apiSettings}
              disabled={isLocked}
              label={t(language, 'field_model')}
              selectPlaceholder={t(language, 'placeholder_select_model')}
              noModelsPlaceholder={t(language, 'placeholder_no_models')}
            />

            <ExpandableTextarea
              label={t(language, 'field_query')}
              value={selectedNode.data.query ?? ''}
              onChange={(value) =>
                patchSelectedNode((n) =>
                  n.type === 'code-search-conductor' ? { ...n, data: { ...n.data, query: value } } : n,
                )
              }
              disabled={isLocked}
              rows={5}
              placeholder={t(language, 'placeholder_conductor_query')}
              expandTitle={t(language, 'editor_expand')}
              doneLabel={t(language, 'editor_done')}
              hintSave={t(language, 'editor_hint_save')}
              closeTitle={t(language, 'modal_close_esc')}
            />
          </>
        )}

        {/* Context Converter Node */}
        {selectedNode.type === 'context-converter' && (
          <InlineCheckbox
            label={t(language, 'field_full_file_mode')}
            checked={!!selectedNode.data.fullFile}
            onChange={(checked) =>
              patchSelectedNode((n) =>
                n.type === 'context-converter' ? { ...n, data: { ...n.data, fullFile: checked } } : n,
              )
            }
            disabled={isLocked}
          />
        )}

        {/* Instruction Node */}
        {selectedNode.type === 'instruction' && (
          <ExpandableTextarea
            label={t(language, 'field_instruction_text')}
            value={selectedNode.data.text ?? ''}
            onChange={(value) =>
              patchSelectedNode((n) =>
                n.type === 'instruction' ? { ...n, data: { ...n.data, text: value } } : n,
              )
            }
            disabled={isLocked}
            rows={8}
            placeholder={t(language, 'placeholder_instruction_text')}
            expandTitle={t(language, 'editor_expand')}
            doneLabel={t(language, 'editor_done')}
            hintSave={t(language, 'editor_hint_save')}
            closeTitle={t(language, 'modal_close_esc')}
          />
        )}

        {/* LLM Node */}
        {selectedNode.type === 'llm' && (
          <>
            <ModelSelect
              value={selectedNode.data.model ?? ''}
              onChange={(modelId) =>
                patchSelectedNode((n) =>
                  n.type === 'llm' ? { ...n, data: { ...n.data, model: modelId } } : n,
                )
              }
              settings={apiSettings}
              disabled={isLocked}
              label={t(language, 'field_model')}
              selectPlaceholder={t(language, 'placeholder_select_model')}
              noModelsPlaceholder={t(language, 'placeholder_no_models')}
            />

            <ExpandableTextarea
              label={t(language, 'field_system_prompt')}
              value={selectedNode.data.systemPrompt ?? ''}
              onChange={(value) =>
                patchSelectedNode((n) =>
                  n.type === 'llm' ? { ...n, data: { ...n.data, systemPrompt: value } } : n,
                )
              }
              disabled={isLocked}
              rows={4}
              placeholder={t(language, 'placeholder_system_prompt')}
              expandTitle={t(language, 'editor_expand')}
              doneLabel={t(language, 'editor_done')}
              hintSave={t(language, 'editor_hint_save')}
              closeTitle={t(language, 'modal_close_esc')}
            />

            <ExpandableTextarea
              label={t(language, 'field_query')}
              value={selectedNode.data.query ?? ''}
              onChange={(value) =>
                patchSelectedNode((n) =>
                  n.type === 'llm' ? { ...n, data: { ...n.data, query: value } } : n,
                )
              }
              disabled={isLocked}
              rows={4}
              placeholder={t(language, 'placeholder_llm_query')}
              expandTitle={t(language, 'editor_expand')}
              doneLabel={t(language, 'editor_done')}
              hintSave={t(language, 'editor_hint_save')}
              closeTitle={t(language, 'modal_close_esc')}
            />
          </>
        )}

        <div className="sfSectionDivider" />

        {/* Actions Section */}
        <div className="sfSectionTitle">{t(language, 'sidebar_actions')}</div>
        <div className="sfButtonGroup">
          {/* @@@ Disabled button tooltip - disabled <button> won't reliably show title, so wrap it */}
          <span className="sfButtonWrap" title={predsBlockedTitle}>
            <button
              onClick={() => runNode(selectedNode.id)}
              disabled={isLocked || predsBlocked}
              style={predsBlocked ? { pointerEvents: 'none' } : undefined}
            >
              {t(language, 'sidebar_run')}
            </button>
          </span>
          <span className="sfButtonWrap" title={predsBlockedTitle}>
            <button
              onClick={() => runFrom(selectedNode.id)}
              disabled={isLocked || predsBlocked}
              style={predsBlocked ? { pointerEvents: 'none' } : undefined}
            >
              {t(language, 'sidebar_chain')}
            </button>
          </span>
          <button
            onClick={() => patchSelectedNode(resetNodeRuntime)}
            disabled={isLocked || selectedNode.data.status === 'running'}
          >
            {t(language, 'sidebar_reset')}
          </button>
          <button onClick={deleteSelectedNodes}>{t(language, 'sidebar_delete')}</button>
        </div>

        {/* Output Section */}
        {selectedNode.data.output !== null && selectedNode.data.output !== undefined && (
          <div className="sfOutputSection">
            <div className="sfOutputHeader">
              <span className="sfOutputTitle">{outputTitle}</span>
              <div className="sfOutputActions">
                <button
                  className="sfViewAllBtn"
                  onClick={() => setIsOutputModalOpen(true)}
                  title={t(language, 'sidebar_view_full_output')}
                >
                  <ExpandIcon /> {t(language, 'sidebar_view_all')}
                </button>
                <CopyButton
                  getText={getOutputText}
                  label={t(language, 'sidebar_copy')}
                  copiedLabel={t(language, 'sidebar_copied')}
                  titleCopy={t(language, 'sidebar_copy_title')}
                  titleCopied={t(language, 'sidebar_copied_title')}
                />
              </div>
            </div>
            {selectedNode.type !== 'code-search' && (
              <div className="sfOutputPreview">
                {typeof selectedNode.data.output === 'string'
                  ? selectedNode.data.output.slice(0, 500) + (selectedNode.data.output.length > 500 ? '...' : '')
                  : JSON.stringify(selectedNode.data.output, null, 2).slice(0, 500)}
              </div>
            )}
            {selectedNode.type === 'code-search' && isCodeSearchOutput(selectedNode.data.output) && (
              <CodeSearchOutputPreview output={selectedNode.data.output} />
            )}
          </div>
        )}

        {selectedNode.type === 'context-converter' && selectedNode.data.mergedFiles && (
          <div className="sfOutputSection">
            <div className="sfOutputHeader">
              <span className="sfOutputTitle">{t(language, 'sidebar_merged_files')}</span>
            </div>
            <CodeSearchOutputPreview output={{ files: selectedNode.data.mergedFiles }} />
          </div>
        )}

        {/* Output Viewer Modal */}
        <OutputViewerModal
          isOpen={isOutputModalOpen}
          title={`${selectedNode.data.title} - ${outputTitle}`}
          content={getOutputText()}
          onClose={() => setIsOutputModalOpen(false)}
          closeLabel={t(language, 'modal_close')}
          hintClose={t(language, 'output_hint_close')}
          closeTitle={t(language, 'modal_close_esc')}
        />

        {/* Error Display */}
        {selectedNode.data.error && (
          <div className="sfErrorSection">
            <div className="sfErrorTitle">{t(language, 'sidebar_error')}</div>
            <div className="sfErrorMessage">{selectedNode.data.error}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}
