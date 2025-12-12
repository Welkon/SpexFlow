import express from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runRelaceSearch } from './relaceSearch.js'
import { loadAppData, saveAppData } from './appData.js'
import { buildRepoContext } from './repoContext.js'
import { runOpenRouterChat } from './openRouter.js'
import { appendSearchRunLog, readRecentSearchRunLogs } from './searchRunLog.js'

const app = express()
const PORT = 3001

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

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

    const repoRoot = path.isAbsolute(repoPathRaw)
      ? repoPathRaw
      : path.join(process.cwd(), repoPathRaw)

    const apiKey = await readApiKeyFromDotfile()
    const result = await runRelaceSearch({ apiKey, repoRoot, userQuery: query })
    await appendSearchRunLog({
      id,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      repoPath: repoPathRaw,
      query,
      ok: true,
      trace: result.trace,
      reportFilesCount: Object.keys(result.report.files ?? {}).length,
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

app.post('/api/repo-context', async (req, res) => {
  try {
    const repoPathRaw = req.body?.repoPath
    const files = req.body?.files
    const fullFile = req.body?.fullFile
    const explanation = req.body?.explanation

    if (typeof repoPathRaw !== 'string') throw new Error('repoPath must be a string')
    if (!files || typeof files !== 'object') throw new Error('files must be an object')
    if (typeof fullFile !== 'boolean') throw new Error('fullFile must be a boolean')

    const repoRoot = path.isAbsolute(repoPathRaw)
      ? repoPathRaw
      : path.join(process.cwd(), repoPathRaw)

    const text = await buildRepoContext({ repoRoot, explanation, files, fullFile })
    res.json({ text })
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
