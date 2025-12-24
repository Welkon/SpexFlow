import { useMemo, useState } from 'react'
import type { AppNode, Spec, SpecRunResult, SpecOutputMapping } from '../types'
import type { Language } from '../../../shared/appDataTypes'
import { t } from '../i18n'
import { SpecEditorModal } from './SpecEditorModal'
import { SpecHistoryModal } from './SpecHistoryModal'
import { SpecOutputModal } from './SpecOutputModal'
import { ConfirmModal } from './ConfirmModal'

type SpecDashboardProps = {
  specs: Spec[]
  nodes: AppNode[]
  onSpecCreate: (spec: Omit<Spec, 'id' | 'status' | 'runHistory' | 'createdAt' | 'updatedAt'>) => void
  onSpecUpdate: (id: string, patch: Partial<Spec>) => void
  onSpecDelete: (id: string) => void
  onSpecRun: (id: string) => void
  onSpecCancel: (id: string) => void
  runningSpecId: string | null
  language: Language
}

function formatNodeName(node: AppNode | undefined) {
  if (!node) return ''
  const custom = node.data.customName?.trim()
  return custom || node.data.title || node.id
}

function getStatusLabel(language: Language, status: Spec['status']) {
  switch (status) {
    case 'ready':
      return t(language, 'spec_status_ready')
    case 'pending':
      return t(language, 'spec_status_pending')
    case 'running':
      return t(language, 'spec_status_running')
    case 'finished':
      return t(language, 'spec_status_finished')
    case 'error':
      return t(language, 'spec_status_error')
  }
}

function buildLastRunSummary(result: SpecRunResult | undefined, emptyRunText: string, emptyOutputsText: string) {
  if (!result) return { text: emptyRunText, hasError: false }
  const entries = Object.entries(result.outputs ?? {})
  if (entries.length === 0) return { text: emptyOutputsText, hasError: !!result.error }
  const text = entries
    .map(([label, value]) => {
      const normalized = value.replace(/\s+/g, ' ').trim()
      return label ? `${label}: ${normalized}` : normalized
    })
    .join(' · ')
  return { text, hasError: !!result.error }
}

export function SpecDashboard({
  specs,
  nodes,
  onSpecCreate,
  onSpecUpdate,
  onSpecDelete,
  onSpecRun,
  onSpecCancel,
  runningSpecId,
  language,
}: SpecDashboardProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingSpec, setEditingSpec] = useState<Spec | null>(null)
  const [historySpec, setHistorySpec] = useState<Spec | null>(null)
  const [outputResult, setOutputResult] = useState<SpecRunResult | null>(null)
  const [deleteSpec, setDeleteSpec] = useState<Spec | null>(null)

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const namedNodes = useMemo(() => nodes.filter((n) => n.data.customName?.trim()), [nodes])
  const noNamedNodes = namedNodes.length === 0

  function handleNewSpec() {
    setEditingSpec(null)
    setIsEditorOpen(true)
  }

  function handleEditSpec(spec: Spec) {
    setEditingSpec(spec)
    setIsEditorOpen(true)
  }

  function handleSaveSpec(data: { name: string; content: string; inputNodeId: string; outputs: SpecOutputMapping[] }) {
    if (editingSpec) {
      onSpecUpdate(editingSpec.id, data)
    } else {
      onSpecCreate(data)
    }
    setIsEditorOpen(false)
    setEditingSpec(null)
  }

  function handleHistory(spec: Spec) {
    setHistorySpec(spec)
  }

  function handleDelete(spec: Spec) {
    setDeleteSpec(spec)
  }

  return (
    <div className="sfSpecDashboard">
      <div className="sfSpecDashboardHeader">
        <div className="sfSpecDashboardTitle">{t(language, 'spec_dashboard')}</div>
        <button className="sfSpecActionBtn sfSpecActionBtn--primary" onClick={handleNewSpec}>
          {t(language, 'spec_new')}
        </button>
      </div>
      <div className="sfSpecDashboardBody">
        {specs.length === 0 ? (
          <div className="sfSpecEmpty">{t(language, 'spec_no_specs')}</div>
        ) : (
          <table className="sfSpecTable">
            <thead>
              <tr>
                <th>{t(language, 'spec_name')}</th>
                <th>{t(language, 'spec_input_node')}</th>
                <th>{t(language, 'spec_status')}</th>
                <th>{t(language, 'spec_actions')}</th>
                <th>{t(language, 'spec_last_result')}</th>
              </tr>
            </thead>
            <tbody>
              {specs.map((spec) => {
                const inputNode = nodeById.get(spec.inputNodeId)
                const inputMissing = !inputNode || !inputNode.data.customName?.trim()
                const statusLabel = getStatusLabel(language, spec.status)
                const isBusy = spec.status === 'running' || spec.status === 'pending' || runningSpecId === spec.id
                const missingOutput = spec.outputs.some((o) => !nodeById.get(o.nodeId))
                const lastRun = spec.runHistory[0]
                const summary = buildLastRunSummary(
                  lastRun,
                  t(language, 'spec_no_history'),
                  t(language, 'spec_no_outputs'),
                )

                return (
                  <tr key={spec.id}>
                    <td>
                      <div className="sfSpecName">
                        {spec.name}
                        {missingOutput ? (
                          <span className="sfSpecWarning" title={t(language, 'spec_node_deleted')}>
                            !
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {inputMissing ? (
                        <div className="sfSpecNodeRef sfSpecNodeRef--deleted">
                          {t(language, 'spec_node_deleted')}
                        </div>
                      ) : (
                        <div className="sfSpecNodeRef">{formatNodeName(inputNode)}</div>
                      )}
                    </td>
                    <td>
                      <span className={`sfSpecStatus sfSpecStatus--${spec.status}`}>{statusLabel}</span>
                    </td>
                    <td>
                      <div className="sfSpecActions">
                        <button
                          className="sfSpecActionBtn sfSpecActionBtn--primary"
                          onClick={() => onSpecRun(spec.id)}
                          disabled={inputMissing || isBusy}
                        >
                          {t(language, 'spec_run')}
                        </button>
                        {(spec.status === 'running' || spec.status === 'pending') && (
                          <button className="sfSpecActionBtn" onClick={() => onSpecCancel(spec.id)}>
                            {t(language, 'spec_cancel')}
                          </button>
                        )}
                        <button className="sfSpecActionBtn" onClick={() => handleEditSpec(spec)}>
                          {t(language, 'spec_edit_btn')}
                        </button>
                        <button className="sfSpecActionBtn" onClick={() => handleHistory(spec)}>
                          {t(language, 'spec_history')}
                        </button>
                        <button className="sfSpecActionBtn sfSpecActionBtn--danger" onClick={() => handleDelete(spec)}>
                          {t(language, 'spec_delete')}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div
                        className={`sfSpecLastResult ${summary.hasError ? 'sfSpecLastResult--error' : ''}`}
                        title={summary.text}
                      >
                        {summary.text}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {noNamedNodes ? <div className="sfSpecEmpty">{t(language, 'spec_no_named_nodes')}</div> : null}
      </div>

      <SpecEditorModal
        isOpen={isEditorOpen}
        spec={editingSpec}
        nodes={nodes}
        onSave={handleSaveSpec}
        onClose={() => {
          setIsEditorOpen(false)
          setEditingSpec(null)
        }}
        language={language}
      />

      {historySpec && (
        <SpecHistoryModal
          isOpen={!!historySpec}
          spec={historySpec}
          onClose={() => setHistorySpec(null)}
          onSelectRun={(result) => {
            setHistorySpec(null)
            setOutputResult(result)
          }}
          language={language}
        />
      )}

      <SpecOutputModal
        isOpen={!!outputResult}
        result={outputResult}
        onClose={() => setOutputResult(null)}
        language={language}
      />

      {deleteSpec && (
        <ConfirmModal
          isOpen={!!deleteSpec}
          title={t(language, 'spec_delete')}
          message={t(language, 'spec_confirm_delete')}
          confirmLabel={t(language, 'confirm')}
          cancelLabel={t(language, 'cancel')}
          onCancel={() => setDeleteSpec(null)}
          onConfirm={() => {
            onSpecDelete(deleteSpec.id)
            setDeleteSpec(null)
          }}
        />
      )}
    </div>
  )
}
