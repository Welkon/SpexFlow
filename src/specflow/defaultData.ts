import type { AppData, AppNode, Canvas } from './types'

function nowIso() {
  return new Date().toISOString()
}

export function defaultAppData(): AppData {
  const canvas = defaultCanvas()

  return {
    version: 1,
    activeTabId: 'tab_1',
    tabs: [
      {
        id: 'tab_1',
        name: 'Canvas 1',
        createdAt: nowIso(),
        canvas,
      },
    ],
  }
}

export function defaultCanvas(): Canvas {
  const nodes: AppNode[] = [
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
  ]

  return {
    nodes,
    edges: [
      { id: 'e_search_ctx', source: 'n_search', target: 'n_ctx' },
      { id: 'e_ctx_llm', source: 'n_ctx', target: 'n_llm' },
    ],
  }
}
