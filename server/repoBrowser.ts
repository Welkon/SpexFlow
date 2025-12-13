import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ManualImportItem, CodeSearchOutput } from '../shared/appDataTypes.js'

export type RepoDirEntry = {
  kind: 'file' | 'dir'
  name: string
  relPath: string
}

const TRUSTED_EXTS = [
  '.md',
  '.txt',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.m',
  '.mm',
]

function isTrustedFile(relPath: string) {
  const ext = path.extname(relPath).toLowerCase()
  return TRUSTED_EXTS.includes(ext)
}

function normalizeRelPath(relPath: string) {
  const trimmed = relPath.trim().replaceAll('\\', '/')
  const normalized = path.posix.normalize(trimmed === '.' ? '' : trimmed)
  if (!normalized || normalized === '.') return ''
  if (normalized.startsWith('/')) throw new Error(`Invalid path (absolute): ${relPath}`)
  if (normalized.startsWith('..')) throw new Error(`Invalid path (escapes repo): ${relPath}`)
  return normalized
}

function joinInRepo(repoRoot: string, relPath: string) {
  const normalized = normalizeRelPath(relPath)
  if (!normalized) return repoRoot
  return path.join(repoRoot, ...normalized.split('/'))
}

function joinPosix(a: string, b: string) {
  const left = a ? normalizeRelPath(a) : ''
  const right = normalizeRelPath(b)
  if (!left) return right
  if (!right) return left
  return path.posix.normalize(`${left}/${right}`)
}

export async function listRepoDir(args: { repoRoot: string; dir: string }) {
  const dirRel = normalizeRelPath(args.dir)
  const dirAbs = joinInRepo(args.repoRoot, dirRel)
  const st = await stat(dirAbs).catch((e: unknown) => {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new Error(`Directory not found: ${dirRel || '.'}`)
    throw e
  })
  if (!st.isDirectory()) throw new Error(`Not a directory: ${dirRel || '.'}`)

  const entries = await readdir(dirAbs, { withFileTypes: true })
  const out: RepoDirEntry[] = []
  for (const entry of entries) {
    const name = entry.name
    if (!name || name === '.' || name === '..') continue
    if (name.startsWith('.')) continue

    const relPath = joinPosix(dirRel, name)
    if (entry.isDirectory()) {
      out.push({ kind: 'dir', name, relPath })
      continue
    }
    if (!entry.isFile()) continue
    if (!isTrustedFile(relPath)) continue
    out.push({ kind: 'file', name, relPath })
  }

  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    dir: dirRel,
    entries: out,
    trustedExtensions: TRUSTED_EXTS,
  }
}

async function listDirOneLevelTrustedFiles(repoRoot: string, dirRel: string) {
  const abs = joinInRepo(repoRoot, dirRel)
  const entries = await readdir(abs, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name || entry.name.startsWith('.')) continue
    const relPath = joinPosix(dirRel, entry.name)
    if (!isTrustedFile(relPath)) continue
    files.push(relPath)
  }

  files.sort()
  return files
}

export async function resolveManualImport(args: { repoRoot: string; items: ManualImportItem[] }): Promise<CodeSearchOutput> {
  if (!Array.isArray(args.items) || args.items.length === 0) throw new Error('No items selected')

  const files = new Set<string>()
  const touchedDirs: string[] = []
  const touchedFiles: string[] = []

  for (const item of args.items) {
    const kind = item?.kind
    const relPath = typeof item?.relPath === 'string' ? normalizeRelPath(item.relPath) : ''
    if (!relPath) throw new Error('Invalid item relPath')

    const abs = joinInRepo(args.repoRoot, relPath)
    const st = await stat(abs).catch((e: unknown) => {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') throw new Error(`Path not found: ${relPath}`)
      throw e
    })

    if (kind === 'file') {
      if (!st.isFile()) throw new Error(`Not a file: ${relPath}`)
      if (!isTrustedFile(relPath)) throw new Error(`Untrusted file extension: ${relPath}`)
      files.add(relPath)
      touchedFiles.push(relPath)
      continue
    }

    if (kind === 'dir') {
      if (!st.isDirectory()) throw new Error(`Not a directory: ${relPath}`)
      touchedDirs.push(relPath)
      const directFiles = await listDirOneLevelTrustedFiles(args.repoRoot, relPath)
      for (const f of directFiles) files.add(f)
      continue
    }

    throw new Error(`Invalid item kind: ${String(kind)}`)
  }

  const fileMap: Record<string, [number, number][]> = {}
  const sortedFiles = [...files].sort()
  for (const relPath of sortedFiles) {
    // @@@manual-import-ranges - use full-file range so Context Converter can reuse the same `files` shape
    fileMap[relPath] = [[1, -1]]
  }

  if (sortedFiles.length === 0) {
    throw new Error('No trusted files resolved from selected items')
  }

  const explanation = [
    'User manually selected paths to include as context (no search).',
    touchedFiles.length ? `- Selected files: ${touchedFiles.sort().join(', ')}` : null,
    touchedDirs.length ? `- Selected folders (non-recursive): ${touchedDirs.sort().join(', ')}` : null,
  ].filter(Boolean).join('\n')

  return { explanation, files: fileMap }
}
