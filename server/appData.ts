import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type NodeStatus = 'idle' | 'running' | 'success' | 'error'

export type BaseNodeData = {
  title: string
  status: NodeStatus
  error: string | null
  locked: boolean
}

export type CodeSearchOutput = {
  explanation: string
  files: Record<string, [number, number][]>
}

export type CodeSearchData = BaseNodeData & {
  repoPath: string
  query: string
  debugMessages: boolean
  output: CodeSearchOutput | null
}

export type ContextConverterData = BaseNodeData & {
  fullFile: boolean
  output: string | null
}

export type InstructionData = BaseNodeData & {
  text: string
  output: string | null
}

export type LLMData = BaseNodeData & {
  model: string
  systemPrompt: string
  query: string
  output: string | null
}

export type AppNode =
  | {
    id: string
    type: 'code-search'
    position: { x: number; y: number }
    data: CodeSearchData
  }
  | {
    id: string
    type: 'context-converter'
    position: { x: number; y: number }
    data: ContextConverterData
  }
  | {
    id: string
    type: 'instruction'
    position: { x: number; y: number }
    data: InstructionData
  }
  | {
    id: string
    type: 'llm'
    position: { x: number; y: number }
    data: LLMData
  }

export type AppEdge = {
  id: string
  source: string
  target: string
}

export type Canvas = { nodes: AppNode[]; edges: AppEdge[] }

export type Tab = {
  id: string
  name: string
  createdAt: string
  canvas: Canvas
}

export type AppData = {
  version: number
  tabs: Tab[]
  activeTabId: string | null
}

function normalizeStatus(status: unknown): NodeStatus {
  if (status === 'idle' || status === 'running' || status === 'success' || status === 'error') return status
  return 'idle'
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null
}

function normalizeNode(raw: unknown): AppNode | null {
  const obj = asRecord(raw)
  if (!obj) return null

  const data = asRecord(obj.data) ?? {}
  const position = asRecord(obj.position) ?? {}

  const id = normalizeString(obj.id)
  const type = obj.type
  if (!id) return null
  if (type !== 'code-search' && type !== 'context-converter' && type !== 'instruction' && type !== 'llm') return null
  const x = typeof position.x === 'number' ? position.x : 0
  const y = typeof position.y === 'number' ? position.y : 0

  const base = {
    title: normalizeString(data.title, type),
    status: normalizeStatus(data.status),
    error: typeof data.error === 'string' ? data.error : null,
    locked: normalizeBool(data.locked, false),
  }

  if (type === 'code-search') {
    const output = asRecord(data.output)
    const normalizedOutput =
      output && typeof output.explanation === 'string' && typeof output.files === 'object'
        ? { explanation: output.explanation, files: output.files as Record<string, [number, number][]> }
        : null

    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        repoPath: normalizeString(data.repoPath),
        query: normalizeString(data.query),
        debugMessages: normalizeBool(data.debugMessages, false),
        output: normalizedOutput,
      },
    }
  }

  if (type === 'context-converter') {
    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        fullFile: normalizeBool(data.fullFile, true),
        output: typeof data.output === 'string' ? data.output : null,
      },
    }
  }

  if (type === 'instruction') {
    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        text: normalizeString(data.text),
        output: typeof data.output === 'string' ? data.output : null,
      },
    }
  }

  return {
    id,
    type,
    position: { x, y },
    data: {
      ...base,
      model: normalizeString(data.model, 'anthropic/claude-3.5-haiku'),
      systemPrompt: normalizeString(data.systemPrompt),
      query: normalizeString(data.query),
      output: typeof data.output === 'string' ? data.output : null,
    },
  }
}

function normalizeAppData(raw: unknown): AppData {
  // @@@appdata-migration - data.json is persisted; normalize older shapes (e.g. missing `locked`) for UI stability
  const now = new Date().toISOString()
  const root = asRecord(raw) ?? {}
  const tabsRaw = Array.isArray(root.tabs) ? root.tabs : []
  const tabs: Tab[] = tabsRaw
    .map((t: unknown): Tab | null => {
      const tab = asRecord(t) ?? {}
      const id = normalizeString(tab.id)
      if (!id) return null
      const canvas = asRecord(tab.canvas) ?? {}
      const nodesRaw = Array.isArray(canvas.nodes) ? canvas.nodes : []
      const edgesRaw = Array.isArray(canvas.edges) ? canvas.edges : []
      const nodes = nodesRaw.map(normalizeNode).filter(isNonNull)
      const edges = edgesRaw
        .map((e: unknown) => {
          const edge = asRecord(e) ?? {}
          return {
            id: normalizeString(edge.id),
            source: normalizeString(edge.source),
            target: normalizeString(edge.target),
          }
        })
        .filter((e) => e.id && e.source && e.target)

      return {
        id,
        name: normalizeString(tab.name, 'Canvas'),
        createdAt: normalizeString(tab.createdAt, now),
        canvas: { nodes, edges },
      }
    })
    .filter(isNonNull)

  const activeTabId = normalizeString(root.activeTabId) || (tabs[0]?.id ?? null)
  return {
    version: typeof root.version === 'number' ? root.version : 1,
    tabs,
    activeTabId,
  }
}

export function defaultAppData(): AppData {
  const now = new Date().toISOString()
  return {
    version: 1,
    activeTabId: 'tab_1',
    tabs: [
      {
        id: 'tab_1',
        name: 'Canvas 1',
        createdAt: now,
        canvas: {
          nodes: [
            {
              id: 'n_search',
              type: 'code-search',
              position: { x: 60, y: 80 },
              data: {
                title: 'Code Search',
                status: 'idle',
                error: null,
                locked: false,
                repoPath: 'examples/example-repo',
                query: 'How is user authentication handled in this codebase?',
                debugMessages: false,
                output: null,
              },
            },
            {
              id: 'n_ctx',
              type: 'context-converter',
              position: { x: 420, y: 80 },
              data: {
                title: 'Context',
                status: 'idle',
                error: null,
                locked: false,
                fullFile: true,
                output: null,
              },
            },
            {
              id: 'n_llm',
              type: 'llm',
              position: { x: 800, y: 80 },
              data: {
                title: 'LLM',
                status: 'idle',
                error: null,
                locked: false,
                model: 'x-ai/grok-4.1-fast',
                systemPrompt:
                  'You are a senior software engineer. Given code context, propose a concrete implementation plan and the key files to edit.',
                query: 'Propose a plan to improve this authentication design.',
                output: null,
              },
            },
          ],
          edges: [
            { id: 'e_search_ctx', source: 'n_search', target: 'n_ctx' },
            { id: 'e_ctx_llm', source: 'n_ctx', target: 'n_llm' },
          ],
        },
      },
    ],
  }
}

const dataPath = path.join(process.cwd(), 'data.json')

export async function loadAppData(): Promise<AppData> {
  try {
    const raw = await readFile(dataPath, 'utf-8')
    return normalizeAppData(JSON.parse(raw))
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return defaultAppData()
    throw err
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  const raw = JSON.stringify(data, null, 2)
  await writeFile(dataPath, raw, 'utf-8')
}
