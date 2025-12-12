import { useMemo, useState } from 'react'

type ReportBackPayload = {
  explanation: string
  files: Record<string, [number, number][]>
}

type RelaceSearchResponse = {
  report: ReportBackPayload
  trace: { turn: number; toolCalls: string[] }[]
}

export function RelaceSearchTester() {
  const defaultQuery = useMemo(
    () => 'How is user authentication handled in this codebase?',
    [],
  )

  const [repoPath, setRepoPath] = useState('examples/example-repo')
  const [query, setQuery] = useState(defaultQuery)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RelaceSearchResponse | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/relace-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, query }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : JSON.stringify(data))
      }
      setResult(data as RelaceSearchResponse)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relaceTester">
      <div className="relaceTesterRow">
        <label>
          Repo path
          <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
        </label>
      </div>

      <div className="relaceTesterRow">
        <label>
          Query
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={5} />
        </label>
      </div>

      <div className="relaceTesterRow">
        <button onClick={run} disabled={loading}>
          {loading ? 'Running…' : 'Run Relace Search'}
        </button>
      </div>

      {error ? (
        <pre className="relaceTesterError">{error}</pre>
      ) : null}

      {result ? (
        <>
          <div className="relaceTesterRow">
            <div className="relaceTesterLabel">Trace</div>
            <pre>{JSON.stringify(result.trace, null, 2)}</pre>
          </div>
          <div className="relaceTesterRow">
            <div className="relaceTesterLabel">Report</div>
            <pre>{JSON.stringify(result.report, null, 2)}</pre>
          </div>
        </>
      ) : null}
    </div>
  )
}

