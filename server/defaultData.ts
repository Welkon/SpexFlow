import type { APISettings } from '../shared/appDataTypes.js'
import type { AppData, Canvas } from './appData.js'

function nowIso() {
  return new Date().toISOString()
}

export function defaultAPISettings(): APISettings {
  return {
    codeSearch: {
      activeProvider: 'relace',
      providers: [
        { id: 'relace', name: 'Relace', apiKey: '' },
      ],
    },
    llm: {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          endpoint: 'https://api.openai.com/v1',
          apiKey: '',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-5.2', name: 'GPT-5.2' },
          ],
        },
        {
          id: 'openrouter',
          name: 'OpenRouter',
          endpoint: 'https://openrouter.ai/api/v1',
          apiKey: '',
          models: [
            { id: 'openai/gpt-4o', name: 'openai/gpt-4o' },
            { id: 'openai/gpt-5.2', name: 'openai/gpt-5.2' },
            { id: 'x-ai/grok-4.1-fast', name: 'x-ai/grok-4.1-fast' },
            { id: 'deepseek/deepseek-v3.2', name: 'deepseek/deepseek-v3.2' },
          ],
        },
      ],
    },
  }
}

export function defaultCanvas(): Canvas {
  return {
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
          muted: false,
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
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

export function defaultAppData(): AppData {
  const now = nowIso()
  return {
    version: 1,
    activeTabId: 'tab_1',
    tabs: [
      {
        id: 'tab_1',
        name: 'Canvas 1',
        createdAt: now,
        canvas: defaultCanvas(),
      },
    ],
    apiSettings: defaultAPISettings(),
    ui: { language: 'en' },
  }
}
