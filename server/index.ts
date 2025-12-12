import express from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runRelaceSearch } from './relaceSearch.js'

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
  try {
    const repoPathRaw = typeof req.body?.repoPath === 'string' ? req.body.repoPath : 'examples/example-repo'
    const query = typeof req.body?.query === 'string' ? req.body.query : 'How is user authentication handled in this codebase?'

    const repoRoot = path.isAbsolute(repoPathRaw)
      ? repoPathRaw
      : path.join(process.cwd(), repoPathRaw)

    const apiKey = await readApiKeyFromDotfile()
    const result = await runRelaceSearch({ apiKey, repoRoot, userQuery: query })
    res.json(result)
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: String(err?.message ?? err) })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
