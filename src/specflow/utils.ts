import type { Edge } from '@xyflow/react'
import type { AppData, AppNode, Tab } from './types'

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

export function getActiveTab(data: AppData): Tab {
  const tab = data.tabs.find((t) => t.id === data.activeTabId)
  if (!tab) throw new Error('activeTabId is invalid')
  return tab
}

export function updateNode(nodes: AppNode[], nodeId: string, patch: (n: AppNode) => AppNode) {
  return nodes.map((n) => (n.id === nodeId ? patch(n) : n))
}

export function predecessors(nodes: AppNode[], edges: Edge[], nodeId: string) {
  const sources = edges.filter((e) => e.target === nodeId).map((e) => e.source)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return sources.map((id) => byId.get(id)).filter(Boolean) as AppNode[]
}

export function canRunFromPredecessors(preds: AppNode[]) {
  if (preds.length === 0) return true
  return preds.every((p) => p.data.status === 'success')
}

export function resetNodeRuntime(node: AppNode): AppNode {
  if (node.data.locked) return node
  if (node.type === 'context-converter') {
    return {
      ...node,
      data: { ...node.data, status: 'idle', error: null, output: null, mergedFiles: undefined },
    } as AppNode
  }
  return { ...node, data: { ...node.data, status: 'idle', error: null, output: null } } as AppNode
}

export function resetNodeRuntimeForPaste(node: AppNode): AppNode {
  if (node.type === 'context-converter') {
    return {
      ...node,
      data: {
        ...node.data,
        status: 'idle' as const,
        error: null,
        locked: false,
        muted: false,
        output: null,
        mergedFiles: undefined,
      },
    } as AppNode
  }
  return {
    ...node,
    data: { ...node.data, status: 'idle' as const, error: null, locked: false, muted: false, output: null },
  } as AppNode
}

export class ChainCancelledError extends Error {
  constructor() {
    super('Chain cancelled')
    this.name = 'ChainCancelledError'
  }
}

export function isAbortError(err: unknown) {
  return (
    !!err &&
    typeof err === 'object' &&
    'name' in err &&
    typeof (err as { name?: unknown }).name === 'string' &&
    (err as { name: string }).name === 'AbortError'
  )
}

export function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new ChainCancelledError()
}

// @@@ Connection validation matrix - see README.md for reference
// Row = source type, Column = target type
// true = valid connection
const CONNECTION_MATRIX: Record<AppNode['type'], Record<AppNode['type'], boolean>> = {
  instruction: {
    instruction: true,
    'code-search-conductor': true,
    'manual-import': false,
    'code-search': true,
    'context-converter': false,
    llm: true,
    archive: false,
  },
  'code-search-conductor': {
    instruction: false,
    'code-search-conductor': false,
    'manual-import': false,
    'code-search': true,
    'context-converter': false,
    llm: false,
    archive: false,
  },
  'manual-import': {
    instruction: false,
    'code-search-conductor': false,
    'manual-import': false,
    'code-search': false,
    'context-converter': true,
    llm: false,
    archive: false,
  },
  'code-search': {
    instruction: false,
    'code-search-conductor': false,
    'manual-import': false,
    'code-search': false,
    'context-converter': true,
    llm: false,
    archive: false,
  },
  'context-converter': {
    instruction: true,
    'code-search-conductor': true,
    'manual-import': false,
    'code-search': true,
    'context-converter': false,
    llm: true,
    archive: false,
  },
  llm: {
    instruction: true,
    'code-search-conductor': true,
    'manual-import': false,
    'code-search': true,
    'context-converter': false,
    llm: true,
    archive: false,
  },
  archive: {
    instruction: false,
    'code-search-conductor': false,
    'manual-import': false,
    'code-search': false,
    'context-converter': false,
    llm: false,
    archive: false,
  },
}

export type ConnectionValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function isValidConnection(
  sourceType: AppNode['type'],
  targetType: AppNode['type'],
): ConnectionValidationResult {
  const allowed = CONNECTION_MATRIX[sourceType]?.[targetType]
  if (allowed) return { valid: true }
  return {
    valid: false,
    reason: `Cannot connect ${sourceType} → ${targetType}`,
  }
}

/**
 * Ensures a node has all required BaseNodeData properties with defaults.
 * Used for migrating old data that may be missing newer properties.
 */
export function migrateNodeData(node: AppNode): AppNode {
  const data = node.data
  let needsMigration = false

  if (typeof data.locked !== 'boolean') needsMigration = true
  if (typeof data.muted !== 'boolean') needsMigration = true
  if (typeof data.status !== 'string') needsMigration = true
  if (typeof data.error !== 'string' && data.error !== null) needsMigration = true

  if (!needsMigration) return node

  return {
    ...node,
    data: {
      ...data,
      status: typeof data.status === 'string' ? data.status : 'idle',
      error: typeof data.error === 'string' || data.error === null ? data.error : null,
      locked: typeof data.locked === 'boolean' ? data.locked : false,
      muted: typeof data.muted === 'boolean' ? data.muted : false,
    },
  } as AppNode
}
