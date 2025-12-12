import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export type SearchRunLogEntry = {
  id: string
  startedAt: string
  durationMs: number
  repoPath: string
  query: string
  ok: boolean
  error?: string
  trace?: { turn: number; toolCalls: string[] }[]
  reportFilesCount?: number
}

const logDir = path.join(process.cwd(), 'logs')
const logPath = path.join(logDir, 'relace-search.jsonl')

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

