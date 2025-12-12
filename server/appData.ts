import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type NodeStatus = 'idle' | 'running' | 'success' | 'error'

export type BaseNodeData = {
  title: string
  status: NodeStatus
  error: string | null
}

export type CodeSearchOutput = {
  explanation: string
  files: Record<string, [number, number][]>
}

export type CodeSearchData = BaseNodeData & {
  repoPath: string
  query: string
  output: CodeSearchOutput | null
}

export type ContextConverterData = BaseNodeData & {
  fullFile: boolean
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
                repoPath: 'examples/example-repo',
                query: 'How is user authentication handled in this codebase?',
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
                model: 'anthropic/claude-3.5-haiku',
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
    return JSON.parse(raw) as AppData
  } catch (err: any) {
    if (err?.code === 'ENOENT') return defaultAppData()
    throw err
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  const raw = JSON.stringify(data, null, 2)
  await writeFile(dataPath, raw, 'utf-8')
}
