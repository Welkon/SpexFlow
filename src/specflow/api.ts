import type { Edge } from '@xyflow/react'
import type { AppData, AppNode, CodeSearchOutput } from './types'
import type { ManualImportItem } from '../../shared/appDataTypes'

export type SavedCanvasFile = {
  version: 1
  id: string
  name: string
  savedAt: string
  settings?: { defaultRepoPath?: string }
  canvas: {
    nodes: AppNode[]
    edges: Edge[]
  }
}

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

export async function listCanvasFiles(): Promise<{ files: Array<{ name: string; path: string; modifiedAt: string }> }> {
  const res = await fetch('/api/canvases')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  return data as { files: Array<{ name: string; path: string; modifiedAt: string }> }
}

export async function saveCanvasFile(fileName: string, canvas: SavedCanvasFile): Promise<{ path: string }> {
  const res = await fetch('/api/canvases/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, canvas }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  if (typeof (data as any)?.path !== 'string') throw new Error('Invalid /api/canvases/save response')
  return data as { path: string }
}

export async function loadCanvasFile(p: string): Promise<SavedCanvasFile> {
  const res = await fetch(`/api/canvases/load?path=${encodeURIComponent(p)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  return data as SavedCanvasFile
}

export async function deleteCanvasFile(p: string): Promise<void> {
  const res = await fetch(`/api/canvases?path=${encodeURIComponent(p)}`, { method: 'DELETE' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
}

export async function runCodeSearch(args: { repoPath: string; query: string; debugMessages?: boolean; signal?: AbortSignal }) {
  const res = await fetch('/api/relace-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repoPath: args.repoPath,
      query: args.query,
      debugMessages: args.debugMessages,
    }),
    signal: args.signal,
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

export async function listRepoDir(args: { repoPath: string; dir: string; signal?: AbortSignal }) {
  const url = new URL('/api/repo-dir', window.location.origin)
  url.searchParams.set('repoPath', args.repoPath)
  url.searchParams.set('dir', args.dir)
  const res = await fetch(url.toString(), { signal: args.signal })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  return data as {
    dir: string
    entries: { kind: 'file' | 'dir'; name: string; relPath: string }[]
    trustedExtensions: string[]
  }
}

export async function resolveManualImport(args: {
  repoPath: string
  items: ManualImportItem[]
  signal?: AbortSignal
}) {
  const res = await fetch('/api/manual-import/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath: args.repoPath, items: args.items }),
    signal: args.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid /api/manual-import/resolve response')
  const report = (data as { report?: unknown }).report
  if (!report || typeof report !== 'object') throw new Error('Invalid /api/manual-import/resolve response: missing report')
  return data as { report: CodeSearchOutput }
}

export async function buildRepoContext(args: {
  repoPath: string
  explanation?: string | null
  files: CodeSearchOutput['files']
  fullFile: boolean
  signal?: AbortSignal
}) {
  const res = await fetch('/api/repo-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: args.signal,
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
  signal?: AbortSignal
}) {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: args.signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
  }
  if (typeof data?.output !== 'string') throw new Error('Invalid /api/llm response')
  return data.output as string
}

function extractJsonObject(text: string): string {
  const t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) return t.slice(first, last + 1)
  return t
}

export async function runConductor(args: {
  model: string
  query: string
  successorIds: string[]
  successorTitles?: Record<string, string>
  signal?: AbortSignal
}): Promise<Record<string, string>> {
  const ids = [...args.successorIds].filter(Boolean)
  if (ids.length === 0) throw new Error('Conductor has no code-search successors')

  const systemPrompt = [
    'You generate code search queries.',
    '',
    'Given a task description and a list of search slots, produce a distinct and complementary code search query for each slot.',
    '',
    'Output MUST be a single JSON object mapping slot_id -> query string.',
    'Rules:',
    '- Return ONLY valid JSON (no markdown, no comments).',
    '- Include ALL slot_ids exactly as given.',
    '- Keep each query short (1-2 sentences).',
  ].join('\n')

  const slotLines = ids.map((id) => {
    const title = args.successorTitles?.[id]
    return title ? `- ${id}: ${title}` : `- ${id}`
  })

  const userQuery = [
    'Task:',
    args.query.trim(),
    '',
    'Slots (slot_id: title):',
    ...slotLines,
    '',
    'Return JSON now.',
  ].join('\n')

  const raw = await runLLM({
    model: args.model,
    systemPrompt,
    query: userQuery,
    context: '',
    signal: args.signal,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(raw))
  } catch (e) {
    throw new Error(`Conductor returned invalid JSON: ${String((e as Error)?.message ?? e)}`)
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('Conductor output is not a JSON object')
  const obj = parsed as Record<string, unknown>

  const missing: string[] = []
  const out: Record<string, string> = {}
  for (const id of ids) {
    const v = obj[id]
    if (typeof v !== 'string' || !v.trim()) {
      missing.push(id)
      continue
    }
    out[id] = v.trim()
  }
  if (missing.length > 0) {
    throw new Error(`Conductor output missing queries for: ${missing.join(', ')}`)
  }
  return out
}
