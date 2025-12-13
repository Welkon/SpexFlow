import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import type {
  CodeSearchConductorNode,
  CodeSearchNode,
  ContextConverterNode,
  InstructionNode,
  LLMNode,
  ManualImportNode,
  NodeStatus,
} from './types'

function repoLabel(repoPath: string) {
  const raw = (repoPath || '').trim()
  if (!raw) return '(unset)'
  const normalized = raw.replaceAll('\\', '/').replaceAll(/\/+$/g, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? normalized
}

function statusStyle(status: NodeStatus) {
  if (status === 'running') return { background: '#fff7d1', borderColor: '#f2c94c' }
  if (status === 'success') return { background: '#eaffea', borderColor: '#27ae60' }
  if (status === 'error') return { background: '#ffecec', borderColor: '#eb5757' }
  return { background: '#fff', borderColor: '#d0d0d0' }
}

function NodeShell(props: {
  title: string
  status: NodeStatus
  subtitle: string
  selected: boolean
  locked: boolean
  muted: boolean
}) {
  const style = statusStyle(props.status)
  return (
    <div
      style={{
        width: 220,
        border: `2px solid ${style.borderColor}`,
        background: style.background,
        borderRadius: 10,
        padding: 10,
        fontSize: 12,
        boxShadow: props.selected ? '0 0 0 3px rgba(0, 110, 255, 0.25)' : 'none',
        opacity: props.locked ? 0.92 : props.muted ? 0.6 : 1,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 10, height: 10, background: '#666' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, background: '#666' }}
      />
      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{props.title}</span>
        {props.locked && <span style={{ fontSize: 12, opacity: 0.85 }}>🔒</span>}
        {props.muted && <span style={{ fontSize: 12, opacity: 0.85 }}>🔇</span>}
      </div>
      <div style={{ opacity: 0.8, marginTop: 4 }}>{props.subtitle}</div>
      <div style={{ marginTop: 8, opacity: 0.7 }}>status: {props.status}</div>
    </div>
  )
}

export function CodeSearchNodeView({ data, selected }: NodeProps<CodeSearchNode>) {
  const hasQuery = !!data.query?.trim()
  const subtitle = hasQuery
    ? `repo: ${repoLabel(data.repoPath)}`
    : `repo: ${repoLabel(data.repoPath)} • (accepts input)`
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={subtitle}
      selected={selected}
      locked={!!data.locked}
      muted={!!data.muted}
    />
  )
}

export function ContextConverterNodeView({
  data,
  selected,
}: NodeProps<ContextConverterNode>) {
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={data.fullFile ? 'full files' : 'line ranges'}
      selected={selected}
      locked={!!data.locked}
      muted={!!data.muted}
    />
  )
}

export function LLMNodeView({ data, selected }: NodeProps<LLMNode>) {
  const hasQuery = !!data.query?.trim()
  const subtitle = hasQuery
    ? `model: ${data.model || '(unset)'}`
    : `model: ${data.model || '(unset)'} • (accepts input)`

  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={subtitle}
      selected={selected}
      locked={!!data.locked}
      muted={!!data.muted}
    />
  )
}

export function InstructionNodeView({ data, selected }: NodeProps<InstructionNode>) {
  const firstLine = (data.text || '').split('\n')[0]?.trim()
  const subtitle = firstLine
    ? `"${firstLine.slice(0, 24)}${firstLine.length > 24 ? '…' : ''}"`
    : '(accepts predecessor input)'
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={subtitle}
      selected={selected}
      locked={!!data.locked}
      muted={!!data.muted}
    />
  )
}

export function CodeSearchConductorNodeView({
  data,
  selected,
}: NodeProps<CodeSearchConductorNode>) {
  const outputsCount = data.output ? Object.keys(data.output).length : 0
  const hasQuery = !!data.query?.trim()
  const subtitle = outputsCount
    ? `${outputsCount} queries`
    : hasQuery
      ? `model: ${data.model || '(unset)'}`
      : `model: ${data.model || '(unset)'} • (accepts input)`
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={subtitle}
      selected={selected}
      locked={!!data.locked}
      muted={!!data.muted}
    />
  )
}

export function ManualImportNodeView({ data, selected }: NodeProps<ManualImportNode>) {
  const itemsCount = Array.isArray(data.items) ? data.items.length : 0
  const subtitle = itemsCount
    ? `repo: ${repoLabel(data.repoPath)} • ${itemsCount} items`
    : `repo: ${repoLabel(data.repoPath)} • (pick files)`
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={subtitle}
      selected={selected}
      locked={!!data.locked}
      muted={!!data.muted}
    />
  )
}
