import type { APISettings, AppData, AppNode, Canvas } from './types'

function nowIso() {
  return new Date().toISOString()
}

export function defaultAPISettings(): APISettings {
  return {
    codeSearch: {
      activeProvider: 'relace',
      providers: [
        { id: 'relace', name: 'Relace', apiKey: '' }
      ]
    },
    llm: {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          endpoint: 'https://api.openai.com/v1',
          apiKey: '',
          models: [
            { id: 'openai-gpt-4', name: 'GPT-4' },
            { id: 'openai-gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'openai-gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
          ]
        },
        {
          id: 'anthropic',
          name: 'Anthropic',
          endpoint: 'https://api.anthropic.com/v1',
          apiKey: '',
          models: [
            { id: 'anthropic-claude-3-opus', name: 'Claude 3 Opus' },
            { id: 'anthropic-claude-3-sonnet', name: 'Claude 3 Sonnet' },
            { id: 'anthropic-claude-3-haiku', name: 'Claude 3 Haiku' },
          ]
        }
      ]
    }
  }
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
    apiSettings: defaultAPISettings(),
    ui: { language: 'en' },
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
        muted: false,
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
        muted: false,
        fullFile: false,
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
        muted: false,
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
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}
