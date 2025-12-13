import type { AppData, CodeSearchOutput } from './types'

export async function fetchAppData(): Promise<AppData> {
  const res = await fetch('/api/app-data')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  return data as AppData
}

export async function saveAppData(data: AppData): Promise<void> {
  const res = await fetch('/api/app-data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : JSON.stringify(body))
  }
}

export async function runCodeSearch(args: { repoPath: string; query: string; debugMessages?: boolean }) {
  const res = await fetch('/api/relace-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = JSON.parse(text) as unknown
  } catch {
    data = null
  }
  if (!res.ok) {
    const maybeError = (data as { error?: unknown } | null)?.error
    const msg = typeof maybeError === 'string'
      ? maybeError
      : `HTTP ${res.status}: ${data !== null ? JSON.stringify(data) : text.slice(0, 1000)}`
    throw new Error(msg)
  }
  if (!data) throw new Error(`Invalid JSON from /api/relace-search (HTTP ${res.status})`)
  return data as { report: CodeSearchOutput; trace: { turn: number; toolCalls: string[] }[] }
}

export async function buildRepoContext(args: {
  repoPath: string
  explanation?: string | null
  files: CodeSearchOutput['files']
  fullFile: boolean
}) {
  const res = await fetch('/api/repo-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  if (typeof data?.text !== 'string') throw new Error('Invalid /api/repo-context response')
  return data.text as string
}

export async function runLLM(args: {
  model: string
  systemPrompt: string
  query: string
  context: string
}) {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  if (typeof data?.output !== 'string') throw new Error('Invalid /api/llm response')
  return data.output as string
}
