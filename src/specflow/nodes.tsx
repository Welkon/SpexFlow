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
import { LockIcon, MuteIcon } from './components/Icons'

function repoLabel(repoPath: string) {
  const raw = (repoPath || '').trim()
  if (!raw) return '(unset)'
  const normalized = raw.replaceAll('\\', '/').replaceAll(/\/+$/g, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? normalized
}

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const raw = (color || '').trim()
  if (!raw) return null
  const m = raw.match(/^#([0-9a-fA-F]{6})$/)
  if (!m) return null
  const hex = m[1]
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (![r, g, b].every(Number.isFinite)) return null
  return { r, g, b }
}

function nodeSurfaceFromCustomColor(customColor?: string): { background: string; borderColor: string } {
  if (!customColor) return { background: '#fff', borderColor: '#d0d0d0' }
  const rgb = parseHexColor(customColor)
  if (!rgb) {
    console.warn(`Invalid customColor: ${customColor}`)
    return { background: '#fff', borderColor: '#d0d0d0' }
  }
  const { r, g, b } = rgb
  return {
    background: `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.18), rgba(255, 255, 255, 0.98))`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.55)`,
  }
}

const STATUS_PILL: Record<
  NodeStatus,
  { bg: string; border: string; text: string; dot: string; glyph: string | null }
> = {
  idle: { bg: '#f5f5f5', border: '#e0e0e0', text: '#555', dot: '#9b9b9b', glyph: null },
  running: { bg: '#fff2c1', border: '#f2c94c', text: '#6b4d00', dot: '#f2c94c', glyph: null },
  success: { bg: '#eaffea', border: '#27ae60', text: '#1f7a44', dot: '#27ae60', glyph: '✓' },
  error: { bg: '#ffecec', border: '#eb5757', text: '#b13b3b', dot: '#eb5757', glyph: '×' },
}

const HANDLE_STYLE = { width: 10, height: 10, background: '#666', zIndex: 5 } as const

function NodeShell(props: {
  title: string
  customName?: string
  customColor?: string
  status: NodeStatus
  subtitle: string
  selected: boolean
  locked: boolean
  muted: boolean
}) {
  const pill = STATUS_PILL[props.status]
  const displayTitle = (props.customName ?? '').trim() || props.title
  const surface = nodeSurfaceFromCustomColor(props.customColor)
  const overlayColorAlpha = props.muted ? 0.5 : 0.35
  return (
    <div
      style={{
        width: 220,
        border: `2px solid ${surface.borderColor}`,
        background: surface.background,
        borderRadius: 10,
        padding: 10,
        fontSize: 12,
        boxShadow: props.selected ? '0 0 0 3px rgba(0, 110, 255, 0.25)' : 'none',
        position: 'relative',
        opacity: props.muted ? 0.7 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />

      {/* @@@state overlay - absolute + pointerEvents none keeps drag/connect behavior intact */}
      {(props.locked || props.muted) && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            pointerEvents: 'none',
            zIndex: 1,
            color: `rgba(0, 0, 0, ${overlayColorAlpha})`,
          }}
        >
          {props.locked && <LockIcon size={38} />}
          {props.muted && <MuteIcon size={38} />}
        </div>
      )}

      <div
        style={{
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayTitle}
          </span>
        </div>

        <span
          title={`status: ${props.status}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 8px',
            borderRadius: 999,
            background: pill.bg,
            border: `1px solid ${pill.border}`,
            color: pill.text,
            fontSize: 11,
            fontWeight: 600,
            userSelect: 'none',
            flex: 'none',
          }}
        >
          {pill.glyph ? (
            <span style={{ fontSize: 12, lineHeight: 1 }}>{pill.glyph}</span>
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: pill.dot,
                display: 'inline-block',
              }}
            />
          )}
          <span style={{ textTransform: 'lowercase' }}>{props.status}</span>
        </span>
      </div>

      <div style={{ opacity: 0.8, marginTop: 4 }}>{props.subtitle}</div>
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
      customName={data.customName}
      customColor={data.customColor}
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
      customName={data.customName}
      customColor={data.customColor}
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
      customName={data.customName}
      customColor={data.customColor}
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
      customName={data.customName}
      customColor={data.customColor}
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
      customName={data.customName}
      customColor={data.customColor}
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
      customName={data.customName}
      customColor={data.customColor}
      status={data.status}
      subtitle={subtitle}
      selected={selected}
      locked={!!data.locked}
      muted={!!data.muted}
    />
  )
}
