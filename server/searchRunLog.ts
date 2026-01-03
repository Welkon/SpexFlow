import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type SearchRunLogEntry = {
  id: string
  startedAt: string
  durationMs: number
  repoPath: string
  query: string
  ok: boolean
  error?: string
  trace?: { turn: number; toolCalls: string[]; pathValidationRetry?: boolean; invalidPaths?: string[] }[]
  reportFilesCount?: number
  messageDumpPath?: string
  messageStats?: { turn: number; messagesChars: number; messagesCount: number }[]
}

const logDir = path.join(process.cwd(), 'logs')
const logPath = path.join(logDir, 'relace-search.jsonl')
const dumpDir = path.join(logDir, 'relace-search-runs')

export async function appendSearchRunLog(entry: SearchRunLogEntry) {
  await mkdir(logDir, { recursive: true })
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf-8')
}

export async function readRecentSearchRunLogs(limit: number) {
  const n = Math.max(1, Math.min(200, limit))
  const raw = await readFile(logPath, 'utf-8').catch(() => '')
  if (!raw.trim()) return []
  const lines = raw.trimEnd().split('\n')
  const tail = lines.slice(Math.max(0, lines.length - n))
  return tail
    .map((line) => {
      try {
        return JSON.parse(line) as SearchRunLogEntry
      } catch {
        return null
      }
    })
    .filter(Boolean) as SearchRunLogEntry[]
}

export async function writeSearchRunDump(runId: string, dump: unknown) {
  await mkdir(dumpDir, { recursive: true })
  const p = path.join(dumpDir, `${runId}.json`)
  await writeFile(p, `${JSON.stringify(dump, null, 2)}\n`, 'utf-8')
  return p
}

export async function readSearchRunDump(runId: string) {
  const p = path.join(dumpDir, `${runId}.json`)
  const raw = await readFile(p, 'utf-8')
  return JSON.parse(raw) as unknown
}
