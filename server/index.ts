import express from 'express'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runRelaceSearch } from './relaceSearch.js'
import { loadAppData, saveAppData, getCodeSearchApiKey } from './appData.js'
import { buildRepoContext } from './repoContext.js'
import { runOpenRouterChat } from './openRouter.js'
import { appendSearchRunLog, readRecentSearchRunLogs, readSearchRunDump } from './searchRunLog.js'
import { listRepoDir, resolveManualImport } from './repoBrowser.js'

const app = express()
const PORT = 3001

app.use(express.json({ limit: '10mb' }))

const CANVASES_DIR = path.join(process.cwd(), 'canvases')

async function ensureCanvasesDir() {
  await mkdir(CANVASES_DIR, { recursive: true })
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

function resolveRepoRoot(repoPathRaw: string) {
  return path.isAbsolute(repoPathRaw)
    ? repoPathRaw
    : path.join(process.cwd(), repoPathRaw)
}

async function readApiKeyFromDotfile() {
  const keyPath = path.join(process.cwd(), '.apikey')
  const key = (await readFile(keyPath, 'utf-8')).trim()
  if (!key) throw new Error('Empty .apikey')
  return key
}

app.post('/api/relace-search', async (req, res) => {
  const startedAt = new Date()
  const id = globalThis.crypto?.randomUUID?.() ?? `run_${Date.now()}`
  try {
    const repoPathRaw = typeof req.body?.repoPath === 'string' ? req.body.repoPath : 'examples/example-repo'
    const query = typeof req.body?.query === 'string' ? req.body.query : 'How is user authentication handled in this codebase?'
    const debugMessages = typeof req.body?.debugMessages === 'boolean' ? req.body.debugMessages : false

    const repoRoot = resolveRepoRoot(repoPathRaw)

    // Try to get API key from persisted settings first, fall back to .apikey file
    const settingsApiKey = await getCodeSearchApiKey()
    const apiKey = settingsApiKey ?? await readApiKeyFromDotfile()
    const result = await runRelaceSearch({
      apiKey,
      repoRoot,
      userQuery: query,
      runId: id,
      dumpMessages: debugMessages,
      dumpOnError: true,
    })
    await appendSearchRunLog({
      id,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      repoPath: repoPathRaw,
      query,
      ok: true,
      trace: result.trace,
      reportFilesCount: Object.keys(result.report.files ?? {}).length,
      messageDumpPath: result.messageDumpPath,
      messageStats: result.messageStats,
    })
    res.json(result)
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    await appendSearchRunLog({
      id,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      repoPath: typeof req.body?.repoPath === 'string' ? req.body.repoPath : 'examples/example-repo',
      query: typeof req.body?.query === 'string' ? req.body.query : '',
      ok: false,
      error: message,
      messageDumpPath: `logs/relace-search-runs/${id}.json`,
    })
    res.status(500).json({ error: message })
  }
})

app.get('/api/relace-search/logs', async (req, res) => {
  try {
    const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : 50
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50
    const entries = await readRecentSearchRunLogs(limit)
    res.json({ entries })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.get('/api/relace-search/logs/:id', async (req, res) => {
  try {
    const runId = req.params.id
    if (typeof runId !== 'string' || !runId.trim()) throw new Error('Missing id')
    const dump = await readSearchRunDump(runId)
    res.json({ dump })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.get('/api/app-data', async (_req, res) => {
  try {
    res.json(await loadAppData())
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.put('/api/app-data', async (req, res) => {
  try {
    await saveAppData(req.body)
    res.json({ ok: true })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.get('/api/canvases', async (_req, res) => {
  try {
    await ensureCanvasesDir()
    const files = await readdir(CANVASES_DIR)
    const canvasFiles = files.filter((f) => f.endsWith('.canvas.json'))
    const result = await Promise.all(
      canvasFiles.map(async (f) => {
        const fullPath = path.join(CANVASES_DIR, f)
        const stats = await stat(fullPath)
        return {
          name: f.replace('.canvas.json', ''),
          path: f,
          modifiedAt: stats.mtime.toISOString(),
        }
      }),
    )
    res.json({ files: result })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.post('/api/canvases/save', async (req, res) => {
  try {
    await ensureCanvasesDir()
    const fileNameRaw = req.body?.fileName
    const canvas = req.body?.canvas
    if (typeof fileNameRaw !== 'string' || !fileNameRaw.trim()) throw new Error('fileName and canvas required')
    if (!canvas || typeof canvas !== 'object') throw new Error('fileName and canvas required')

    const safeName = fileNameRaw.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    if (!safeName) throw new Error('Invalid fileName')

    const filePath = path.join(CANVASES_DIR, `${safeName}.canvas.json`)
    await writeFile(filePath, JSON.stringify(canvas, null, 2))
    res.json({ ok: true, path: `${safeName}.canvas.json` })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.get('/api/canvases/load', async (req, res) => {
  try {
    await ensureCanvasesDir()
    const fileName = req.query.path
    if (typeof fileName !== 'string' || !fileName.trim()) throw new Error('path required')
    if (fileName.includes('/') || fileName.includes('\\')) throw new Error('Invalid path')

    const filePath = path.join(CANVASES_DIR, fileName)
    const content = await readFile(filePath, 'utf-8')
    const canvas = JSON.parse(content) as unknown
    res.json(canvas)
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.delete('/api/canvases', async (req, res) => {
  try {
    await ensureCanvasesDir()
    const fileName = req.query.path
    if (typeof fileName !== 'string' || !fileName.trim()) throw new Error('path required')
    if (fileName.includes('/') || fileName.includes('\\')) throw new Error('Invalid path')

    const filePath = path.join(CANVASES_DIR, fileName)
    await unlink(filePath)
    res.json({ ok: true })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.post('/api/repo-context', async (req, res) => {
  try {
    const repoPathRaw = req.body?.repoPath
    const files = req.body?.files
    const fullFile = req.body?.fullFile
    const explanation = req.body?.explanation

    if (typeof repoPathRaw !== 'string') throw new Error('repoPath must be a string')
    if (!files || typeof files !== 'object') throw new Error('files must be an object')
    if (typeof fullFile !== 'boolean') throw new Error('fullFile must be a boolean')

    const repoRoot = resolveRepoRoot(repoPathRaw)

    const text = await buildRepoContext({ repoRoot, explanation, files, fullFile })
    res.json({ text })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.get('/api/repo-dir', async (req, res) => {
  try {
    const repoPathRaw = typeof req.query?.repoPath === 'string' ? req.query.repoPath : ''
    const dir = typeof req.query?.dir === 'string' ? req.query.dir : ''
    if (!repoPathRaw.trim()) throw new Error('repoPath is required')
    const repoRoot = resolveRepoRoot(repoPathRaw)
    const result = await listRepoDir({ repoRoot, dir })
    res.json(result)
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.post('/api/manual-import/resolve', async (req, res) => {
  try {
    const repoPathRaw = req.body?.repoPath
    const items = req.body?.items
    if (typeof repoPathRaw !== 'string' || !repoPathRaw.trim()) throw new Error('repoPath must be a string')
    if (!Array.isArray(items)) throw new Error('items must be an array')

    const repoRoot = resolveRepoRoot(repoPathRaw)
    const report = await resolveManualImport({ repoRoot, items })
    res.json({ report })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.post('/api/llm', async (req, res) => {
  try {
    const model = req.body?.model
    const systemPrompt = req.body?.systemPrompt
    const query = req.body?.query
    const context = req.body?.context

    if (typeof model !== 'string') throw new Error('model must be a string')
    if (typeof systemPrompt !== 'string') throw new Error('systemPrompt must be a string')
    if (typeof query !== 'string') throw new Error('query must be a string')
    if (typeof context !== 'string') throw new Error('context must be a string')

    const userPrompt = [context.trimEnd(), '', '---', '', query].join('\n')
    const output = await runOpenRouterChat({ model, systemPrompt, userPrompt })
    res.json({ output })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
