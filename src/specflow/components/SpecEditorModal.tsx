import { useEffect, useMemo, useState } from 'react'
import type { AppNode, Spec, SpecOutputMapping } from '../types'
import type { Language } from '../../../shared/appDataTypes'
import { t } from '../i18n'
import { useModalBackdropClose } from '../hooks/useModalBackdropClose'

type SpecEditorModalProps = {
  isOpen: boolean
  spec: Spec | null
  nodes: AppNode[]
  initialData?: { name: string; content: string; inputNodeId: string; outputs: SpecOutputMapping[] } | null
  onSave: (data: { name: string; content: string; inputNodeId: string; outputs: SpecOutputMapping[] }) => void
  onClose: () => void
  language: Language
}

const INPUT_TYPES = new Set<AppNode['type']>(['instruction', 'llm', 'code-search', 'code-search-conductor'])
const OUTPUT_TYPES = new Set<AppNode['type']>([
  'instruction',
  'llm',
  'context-converter',
  'code-search',
  'manual-import',
])

function getNodeLabel(node: AppNode) {
  const custom = node.data.customName?.trim()
  return `${custom ?? node.data.title} (${node.type})`
}

export function SpecEditorModal({
  isOpen,
  spec,
  nodes,
  initialData,
  onSave,
  onClose,
  language,
}: SpecEditorModalProps) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [inputNodeId, setInputNodeId] = useState('')
  const [outputs, setOutputs] = useState<SpecOutputMapping[]>([])

  useEffect(() => {
    if (!isOpen) return
    setName(spec?.name ?? initialData?.name ?? '')
    setContent(spec?.content ?? initialData?.content ?? '')
    setInputNodeId(spec?.inputNodeId ?? initialData?.inputNodeId ?? '')
    setOutputs(spec?.outputs ?? initialData?.outputs ?? [])
  }, [isOpen, spec, initialData])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const namedNodes = nodes.filter((n) => n.data.customName?.trim())
  const inputNodes = namedNodes.filter((n) => INPUT_TYPES.has(n.type))
  const outputNodes = namedNodes.filter((n) => OUTPUT_TYPES.has(n.type))

  const groupedInputs = useMemo(() => {
    const groups = new Map<AppNode['type'], AppNode[]>()
    for (const node of inputNodes) {
      const bucket = groups.get(node.type) ?? []
      bucket.push(node)
      groups.set(node.type, bucket)
    }
    return groups
  }, [inputNodes])

  const groupedOutputs = useMemo(() => {
    const groups = new Map<AppNode['type'], AppNode[]>()
    for (const node of outputNodes) {
      const bucket = groups.get(node.type) ?? []
      bucket.push(node)
      groups.set(node.type, bucket)
    }
    return groups
  }, [outputNodes])

  const inputNode = nodeById.get(inputNodeId)
  const inputMissing =
    inputNodeId &&
    (!inputNode || !inputNode.data.customName?.trim() || !INPUT_TYPES.has(inputNode.type))

  const canSave =
    name.trim().length > 0 &&
    inputNodeId &&
    !inputMissing &&
    outputs.every((o) => o.nodeId && o.label.trim().length > 0)

  const { handleBackdropClick, contentMouseHandlers } = useModalBackdropClose(onClose)

  if (!isOpen) return null

  function handleAddOutput() {
    setOutputs((prev) => [...prev, { nodeId: '', label: '' }])
  }

  function handleOutputChange(index: number, patch: Partial<SpecOutputMapping>) {
    setOutputs((prev) =>
      prev.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    )
  }

  function handleRemoveOutput(index: number) {
    setOutputs((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    if (!canSave) return
    onSave({
      name: name.trim(),
      content,
      inputNodeId,
      outputs: outputs.map((o) => ({ ...o, label: o.label.trim() })),
    })
  }

  return (
    <div className="sfModalBackdrop" onClick={handleBackdropClick}>
      <div className="sfModalContent" {...contentMouseHandlers}>
        <div className="sfModalHeader">
          <span className="sfModalTitle">
            {spec ? t(language, 'spec_edit') : t(language, 'spec_new')}
          </span>
          <button className="sfModalCloseBtn" onClick={onClose} title={t(language, 'modal_close_esc')}>
            ×
          </button>
        </div>

        <div className="sfSpecEditor">
          <div className="sfSpecEditorField">
            <label className="sfSpecEditorLabel">{t(language, 'spec_name')}</label>
            <input
              className="sfSpecEditorInput"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(language, 'spec_name')}
            />
          </div>

          <div className="sfSpecEditorField">
            <label className="sfSpecEditorLabel">{t(language, 'spec_input_node')}</label>
            <select
              className="sfSpecEditorSelect"
              value={inputNodeId}
              onChange={(e) => setInputNodeId(e.target.value)}
            >
              <option value="">{t(language, 'spec_select_node')}</option>
              {inputMissing && (
                <option value={inputNodeId}>{t(language, 'spec_node_deleted')}</option>
              )}
              {[...groupedInputs.entries()].map(([type, group]) => (
                <optgroup key={type} label={type}>
                  {group.map((node) => (
                    <option key={node.id} value={node.id}>
                      {getNodeLabel(node)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {inputNodes.length === 0 && (
              <div className="sfSpecNodeRef sfSpecNodeRef--deleted" style={{ marginTop: 8 }}>
                {t(language, 'spec_no_named_nodes')}
              </div>
            )}
          </div>

          <div className="sfSpecEditorField">
            <label className="sfSpecEditorLabel">{t(language, 'spec_content')}</label>
            <textarea
              className="sfSpecEditorTextarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t(language, 'spec_content')}
            />
          </div>

          <div className="sfSpecEditorField">
            <label className="sfSpecEditorLabel">{t(language, 'spec_output_nodes')}</label>
            <div className="sfSpecOutputList">
              {outputs.map((output, index) => {
                const outputNode = nodeById.get(output.nodeId)
                const outputMissing =
                  output.nodeId &&
                  (!outputNode || !outputNode.data.customName?.trim() || !OUTPUT_TYPES.has(outputNode.type))

                return (
                  <div key={`${output.nodeId}-${index}`} className="sfSpecOutputRow">
                    <select
                      className="sfSpecEditorSelect"
                      value={output.nodeId}
                      onChange={(e) => handleOutputChange(index, { nodeId: e.target.value })}
                    >
                      <option value="">{t(language, 'spec_select_node')}</option>
                      {outputMissing && (
                        <option value={output.nodeId}>{t(language, 'spec_node_deleted')}</option>
                      )}
                      {[...groupedOutputs.entries()].map(([type, group]) => (
                        <optgroup key={type} label={type}>
                          {group.map((node) => (
                            <option key={node.id} value={node.id}>
                              {getNodeLabel(node)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      className="sfSpecEditorInput"
                      value={output.label}
                      onChange={(e) => handleOutputChange(index, { label: e.target.value })}
                      placeholder={t(language, 'spec_output_label')}
                    />
                    <button
                      className="sfSpecActionBtn sfSpecActionBtn--danger"
                      onClick={() => handleRemoveOutput(index)}
                      type="button"
                    >
                      {t(language, 'spec_delete')}
                    </button>
                  </div>
                )
              })}
            </div>
            <button className="sfSpecAddOutputBtn" onClick={handleAddOutput} type="button">
              {t(language, 'spec_add_output')}
            </button>
            {outputNodes.length === 0 && (
              <div className="sfSpecNodeRef sfSpecNodeRef--deleted" style={{ marginTop: 8 }}>
                {t(language, 'spec_no_named_nodes')}
              </div>
            )}
          </div>
        </div>

        <div className="sfModalFooter">
          <span className="sfModalHint">{t(language, 'editor_hint_save')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sfCancelBtn" onClick={onClose}>
              {t(language, 'cancel')}
            </button>
            <button className="sfModalSaveBtn" onClick={handleSave} disabled={!canSave}>
              {t(language, 'save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
