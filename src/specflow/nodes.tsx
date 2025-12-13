import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import type {
  CodeSearchNode,
  ContextConverterNode,
  InstructionNode,
  LLMNode,
  NodeStatus,
} from './types'

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
        opacity: props.locked ? 0.92 : 1,
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
        {props.locked ? <span style={{ fontSize: 12, opacity: 0.85 }}>🔒</span> : null}
      </div>
      <div style={{ opacity: 0.8, marginTop: 4 }}>{props.subtitle}</div>
      <div style={{ marginTop: 8, opacity: 0.7 }}>status: {props.status}</div>
    </div>
  )
}

export function CodeSearchNodeView({ data, selected }: NodeProps<CodeSearchNode>) {
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={`repo: ${data.repoPath || '(unset)'}`}
      selected={selected}
      locked={!!data.locked}
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
    />
  )
}

export function LLMNodeView({ data, selected }: NodeProps<LLMNode>) {
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={`model: ${data.model || '(unset)'}`}
      selected={selected}
      locked={!!data.locked}
    />
  )
}

export function InstructionNodeView({ data, selected }: NodeProps<InstructionNode>) {
  const firstLine = (data.text || '').split('\n')[0]?.trim()
  return (
    <NodeShell
      title={data.title}
      status={data.status}
      subtitle={firstLine ? `“${firstLine.slice(0, 24)}${firstLine.length > 24 ? '…' : ''}”` : 'instruction'}
      selected={selected}
      locked={!!data.locked}
    />
  )
}
