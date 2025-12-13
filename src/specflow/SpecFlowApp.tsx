import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { defaultAppData, defaultCanvas } from './defaultData'
import type { AppData, AppNode, CodeSearchOutput, Tab } from './types'
import { buildRepoContext, fetchAppData, runCodeSearch, runLLM, saveAppData } from './api'
import { CodeSearchNodeView, ContextConverterNodeView, InstructionNodeView, LLMNodeView } from './nodes'

type Selected = { nodeId: string } | null

type LocalOutput =
  | { kind: 'string'; value: string }
  | { kind: 'code-search'; value: CodeSearchOutput; repoPath: string }

type RunMode = 'single' | 'chain'

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function getActiveTab(data: AppData): Tab {
  const tab = data.tabs.find((t) => t.id === data.activeTabId)
  if (!tab) throw new Error('activeTabId is invalid')
  return tab
}

function updateNode(nodes: AppNode[], nodeId: string, patch: (n: AppNode) => AppNode) {
  return nodes.map((n) => (n.id === nodeId ? patch(n) : n))
}

function predecessors(nodes: AppNode[], edges: Edge[], nodeId: string) {
  const sources = edges.filter((e) => e.target === nodeId).map((e) => e.source)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return sources.map((id) => byId.get(id)).filter(Boolean) as AppNode[]
}

function canRunFromPredecessors(preds: AppNode[]) {
  if (preds.length === 0) return true
  return preds.every((p) => p.data.status === 'success')
}

export function SpecFlowApp() {
  const [appData, setAppData] = useState<AppData>(() => defaultAppData())
  const appDataRef = useRef(appData)
  const [selected, setSelected] = useState<Selected>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const inFlightRuns = useRef(new Map<string, Promise<LocalOutput | null>>())

  const activeTab = useMemo(() => getActiveTab(appData), [appData])

  useEffect(() => {
    appDataRef.current = appData
  }, [appData])

  useEffect(() => {
    let alive = true
    fetchAppData()
      .then((data) => {
        if (!alive) return
        setAppData(data)
      })
      .catch((e) => {
        if (!alive) return
        setLoadError(String(e?.message ?? e))
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveAppData(appData).catch((e) => {
        console.error(e)
      })
    }, 400)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [appData])

  const nodeTypes = useMemo(
    () => ({
      'code-search': CodeSearchNodeView,
      'context-converter': ContextConverterNodeView,
      instruction: InstructionNodeView,
      llm: LLMNodeView,
    }),
    [],
  )

  function setActiveTabId(tabId: string) {
    setSelected(null)
    setAppData((d) => ({ ...d, activeTabId: tabId }))
  }

  function addTab() {
    const id = uid('tab')
    const tab: Tab = {
      id,
      name: `Canvas ${appData.tabs.length + 1}`,
      createdAt: new Date().toISOString(),
      canvas: defaultCanvas(),
    }
    setAppData((d) => ({ ...d, tabs: [...d.tabs, tab], activeTabId: id }))
  }

  function renameTab(tabId: string) {
    const tab = appDataRef.current.tabs.find((t) => t.id === tabId)
    if (!tab) return
    const nextName = window.prompt('Canvas name?', tab.name) ?? ''
    if (!nextName.trim()) return
    setAppData((d) => ({
      ...d,
      tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, name: nextName.trim() } : t)),
    }))
  }

  function closeTab(tabId: string) {
    setAppData((d) => {
      const nextTabs = d.tabs.filter((t) => t.id !== tabId)
      const nextActive =
        d.activeTabId === tabId ? (nextTabs[0]?.id ?? null) : d.activeTabId
      return { ...d, tabs: nextTabs, activeTabId: nextActive }
    })
    setSelected(null)
  }

  function deleteSelectedNode() {
    if (!selected) return
    const nodeId = selected.nodeId
    updateActiveCanvas((t) => ({
      ...t,
      canvas: {
        nodes: t.canvas.nodes.filter((n) => n.id !== nodeId),
        edges: t.canvas.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      },
    }))
    setSelected(null)
  }

  function resetNodeRuntime(node: AppNode): AppNode {
    if (node.data.locked) return node
    if (node.type === 'code-search') {
      return { ...node, data: { ...node.data, status: 'idle', error: null, output: null } }
    }
    if (node.type === 'instruction') {
      return { ...node, data: { ...node.data, status: 'idle', error: null, output: null } }
    }
    if (node.type === 'context-converter') {
      return { ...node, data: { ...node.data, status: 'idle', error: null, output: null } }
    }
    return { ...node, data: { ...node.data, status: 'idle', error: null, output: null } }
  }

  function resetActiveCanvasAll() {
    if (inFlightRuns.current.size > 0) {
      window.alert('Some nodes are running. Wait for them to finish before resetting.')
      return
    }
    updateActiveCanvas((t) => ({
      ...t,
      canvas: {
        ...t.canvas,
        nodes: t.canvas.nodes.map(resetNodeRuntime),
      },
    }))
  }

  function updateActiveCanvas(patch: (tab: Tab) => Tab) {
    setAppData((d) => {
      const nextTabs = d.tabs.map((t) => (t.id === d.activeTabId ? patch(t) : t))
      return { ...d, tabs: nextTabs }
    })
  }

  function onNodesChange(changes: NodeChange<AppNode>[]) {
    updateActiveCanvas((t) => ({
      ...t,
      canvas: { ...t.canvas, nodes: applyNodeChanges(changes, t.canvas.nodes) },
    }))
  }

  function onEdgesChange(changes: EdgeChange<Edge>[]) {
    updateActiveCanvas((t) => ({
      ...t,
      canvas: { ...t.canvas, edges: applyEdgeChanges(changes, t.canvas.edges) },
    }))
  }

  function onConnect(params: Connection) {
    updateActiveCanvas((t) => ({
      ...t,
      canvas: { ...t.canvas, edges: addEdge(params, t.canvas.edges) },
    }))
  }

  function addNode(type: AppNode['type']) {
    const id = uid('n')
    const base = {
      id,
      type,
      position: { x: 80, y: 80 + activeTab.canvas.nodes.length * 40 },
    } as const

    let node: AppNode
    if (type === 'code-search') {
      node = {
        ...base,
        type,
        data: {
          title: 'Code Search',
          status: 'idle',
          error: null,
          locked: false,
          repoPath: '',
          query: '',
          debugMessages: false,
          output: null,
        },
      }
    } else if (type === 'context-converter') {
      node = {
        ...base,
        type,
        data: {
          title: 'Context',
          status: 'idle',
          error: null,
          locked: false,
          fullFile: true,
          output: null,
        },
      }
    } else if (type === 'instruction') {
      node = {
        ...base,
        type,
        data: {
          title: 'Instruction',
          status: 'idle',
          error: null,
          locked: false,
          text: '',
          output: null,
        },
      }
    } else {
      node = {
        ...base,
        type,
        data: {
          title: 'LLM',
          status: 'idle',
          error: null,
          locked: false,
          model: 'x-ai/grok-4.1-fast',
          systemPrompt: '',
          query: '',
          output: null,
        },
      }
    }

    updateActiveCanvas((t) => ({
      ...t,
      canvas: { ...t.canvas, nodes: [...t.canvas.nodes, node] },
    }))
    setSelected({ nodeId: id })
  }

  function patchSelectedNode(patch: (n: AppNode) => AppNode) {
    if (!selected) return
    updateActiveCanvas((t) => ({
      ...t,
      canvas: {
        ...t.canvas,
        nodes: updateNode(t.canvas.nodes, selected.nodeId, patch),
      },
    }))
  }

  function patchNodeById(nodeId: string, patch: (n: AppNode) => AppNode) {
    updateActiveCanvas((t) => ({
      ...t,
      canvas: {
        ...t.canvas,
        nodes: updateNode(t.canvas.nodes, nodeId, patch),
      },
    }))
  }

  function nodeToLocalOutput(node: AppNode): LocalOutput | null {
    if (node.type === 'code-search') {
      return node.data.output
        ? { kind: 'code-search', value: node.data.output, repoPath: node.data.repoPath }
        : null
    }
    if (node.type === 'context-converter' || node.type === 'instruction' || node.type === 'llm') {
      return node.data.output ? { kind: 'string', value: node.data.output } : null
    }
    return null
  }

  function getStringOutput(nodeId: string, localOutputs?: Map<string, LocalOutput>): string {
    const local = localOutputs?.get(nodeId)
    if (local?.kind === 'string') return local.value

    const snap = getActiveTab(appDataRef.current)
    const n = snap.canvas.nodes.find((x) => x.id === nodeId)
    if (!n) return ''
    if (n.type === 'context-converter' || n.type === 'instruction' || n.type === 'llm') return n.data.output ?? ''
    return ''
  }

  function getCodeSearchOutput(nodeId: string, localOutputs?: Map<string, LocalOutput>): CodeSearchOutput | null {
    const local = localOutputs?.get(nodeId)
    if (local?.kind === 'code-search') return local.value

    const snap = getActiveTab(appDataRef.current)
    const n = snap.canvas.nodes.find((x) => x.id === nodeId)
    if (!n) return null
    if (n.type === 'code-search') return n.data.output
    return null
  }

  function getCodeSearchRepoPath(nodeId: string, localOutputs?: Map<string, LocalOutput>): string {
    const local = localOutputs?.get(nodeId)
    if (local?.kind === 'code-search' && typeof local.repoPath === 'string') return local.repoPath

    const snap = getActiveTab(appDataRef.current)
    const n = snap.canvas.nodes.find((x) => x.id === nodeId)
    if (!n) return ''
    if (n.type === 'code-search') return n.data.repoPath
    return ''
  }

  function concatPredStrings(preds: AppNode[], localOutputs?: Map<string, LocalOutput>) {
    const parts: string[] = []
    for (const p of preds) {
      if (p.type === 'context-converter' || p.type === 'instruction' || p.type === 'llm') {
        const s = getStringOutput(p.id, localOutputs).trim()
        if (s) parts.push(s)
      }
    }
    return parts.join('\n\n')
  }

  async function runNode(nodeId: string, mode: RunMode = 'single', localOutputs?: Map<string, LocalOutput>) {
    const existing = inFlightRuns.current.get(nodeId)
    if (existing) return existing

    const promise = (async () => {
      const snapshot = getActiveTab(appDataRef.current)
      const node = snapshot.canvas.nodes.find((n) => n.id === nodeId)
      if (!node) throw new Error(`Node not found: ${nodeId}`)
      if (mode === 'single' && node.data.locked) throw new Error('Node is locked')

      const preds = predecessors(snapshot.canvas.nodes, snapshot.canvas.edges, nodeId)
      if (mode === 'single') {
        if (!canRunFromPredecessors(preds) && !(node.type === 'code-search' && node.data.query.trim())) {
          throw new Error('Predecessors not succeeded yet.')
        }
      }

      patchNodeById(nodeId, (n) => ({ ...n, data: { ...n.data, status: 'running', error: null } } as AppNode))

      try {
        if (node.type === 'instruction') {
          const predText = concatPredStrings(preds, localOutputs).trim()
          const ownText = node.data.text.trim()
          const finalText = ownText || predText || window.prompt('Instruction?') || ''
          if (!finalText.trim()) throw new Error('Empty instruction')

          patchNodeById(nodeId, (n) => {
            if (n.type !== 'instruction') return n
            return {
              ...n,
              data: {
                ...n.data,
                text: finalText,
                output: finalText,
                status: 'success',
                error: null,
              },
            }
          })

          const out: LocalOutput = { kind: 'string', value: finalText }
          localOutputs?.set(nodeId, out)
          return out
        }

        if (node.type === 'code-search') {
          const input = concatPredStrings(preds, localOutputs)
          const query = node.data.query.trim() ? node.data.query.trim() : input.trim()
          const finalQuery =
            query || window.prompt('Code search query?') || ''
          if (!finalQuery.trim()) throw new Error('Empty query')

          let repoPath = (node.data.repoPath || '').trim()
          if (!repoPath) {
            repoPath = window.prompt('Repo path?', 'examples/example-repo') || ''
            if (!repoPath.trim()) throw new Error('Empty repoPath')
          }
          const result = await runCodeSearch({
            repoPath,
            query: finalQuery,
            debugMessages: !!node.data.debugMessages,
          })
          patchNodeById(nodeId, (n) => {
            if (n.type !== 'code-search') return n
            return {
              ...n,
              data: {
                ...n.data,
                repoPath,
                query: finalQuery,
                output: result.report,
                status: 'success',
                error: null,
              },
            }
          })
          const out: LocalOutput = { kind: 'code-search', value: result.report, repoPath }
          localOutputs?.set(nodeId, out)
          return out
        }

        if (node.type === 'context-converter') {
          const searchPreds = preds.filter((p) => p.type === 'code-search') as Extract<AppNode, { type: 'code-search' }>[]
          if (searchPreds.length === 0) throw new Error('Context converter requires a code-search predecessor.')

          const contexts = await Promise.all(
            searchPreds.map(async (p) => {
              const out = getCodeSearchOutput(p.id, localOutputs)
              if (!out) throw new Error('Code-search predecessor has no output.')
              return buildRepoContext({
                repoPath: getCodeSearchRepoPath(p.id, localOutputs),
                explanation: out.explanation,
                files: out.files,
                fullFile: node.data.fullFile,
              })
            }),
          )

          const text = contexts.join('\n\n---\n\n')
          patchNodeById(nodeId, (n) => {
            if (n.type !== 'context-converter') return n
            return {
              ...n,
              data: {
                ...n.data,
                output: text,
                status: 'success',
                error: null,
              },
            }
          })
          const out: LocalOutput = { kind: 'string', value: text }
          localOutputs?.set(nodeId, out)
          return out
        }

        const context = concatPredStrings(preds, localOutputs)
        const finalQuery = node.data.query.trim() ? node.data.query.trim() : window.prompt('LLM query?') || ''
        if (!finalQuery.trim()) throw new Error('Empty query')

        let systemPrompt = node.data.systemPrompt.trim()
        if (!systemPrompt) {
          systemPrompt = window.prompt('System prompt?', '') || ''
          if (!systemPrompt.trim()) throw new Error('Empty systemPrompt')
        }

        const model = node.data.model.trim()
        if (!model) throw new Error('Empty model')

        const output = await runLLM({
          model,
          systemPrompt,
          query: finalQuery,
          context,
        })

        patchNodeById(nodeId, (n) => {
          if (n.type !== 'llm') return n
          return {
            ...n,
            data: {
              ...n.data,
              systemPrompt,
              query: finalQuery,
              output,
              status: 'success',
              error: null,
            },
          }
        })
        const out: LocalOutput = { kind: 'string', value: output }
        localOutputs?.set(nodeId, out)
        return out
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        patchNodeById(nodeId, (n) => ({ ...n, data: { ...n.data, status: 'error', error: message } } as AppNode))
        throw err
      }
    })()
      .finally(() => {
        inFlightRuns.current.delete(nodeId)
      })

    inFlightRuns.current.set(nodeId, promise)
    return promise
  }

  async function runFrom(nodeId: string) {
    const tabNow = getActiveTab(appDataRef.current)
    const start = tabNow.canvas.nodes.find((n) => n.id === nodeId)
    if (start?.data.locked) return

    const localOutputs = new Map<string, LocalOutput>()
    const tabSnapshot = getActiveTab(appDataRef.current)
    const edges = tabSnapshot.canvas.edges

    const predIdsBy = new Map<string, string[]>()
    const succIdsBy = new Map<string, string[]>()
    for (const e of edges) {
      predIdsBy.set(e.target, [...(predIdsBy.get(e.target) ?? []), e.source])
      succIdsBy.set(e.source, [...(succIdsBy.get(e.source) ?? []), e.target])
    }

    const reachable = new Set<string>()
      ; (function mark(id: string) {
        if (reachable.has(id)) return
        reachable.add(id)
        for (const next of succIdsBy.get(id) ?? []) mark(next)
      })(nodeId)

    const resetSet = new Set<string>()
    for (const id of reachable) {
      const n = tabSnapshot.canvas.nodes.find((x) => x.id === id)
      if (!n) continue
      if (n.data.locked) continue
      resetSet.add(id)
    }

    if ([...resetSet].some((id) => inFlightRuns.current.has(id))) {
      throw new Error('Some nodes in this chain are running. Wait for them to finish before chaining.')
    }

    // @@@chain-reset - chain re-runs by resetting runtime fields for reachable, non-locked nodes
    updateActiveCanvas((t) => ({
      ...t,
      canvas: {
        ...t.canvas,
        nodes: t.canvas.nodes.map((n) => (resetSet.has(n.id) ? resetNodeRuntime(n) : n)),
      },
    }))

    const scheduled = new Map<string, Promise<LocalOutput | null>>()
    const visiting = new Set<string>()

    async function requireExternalPredSuccess(predId: string) {
      const inflight = inFlightRuns.current.get(predId)
      if (inflight) {
        try {
          const out = await inflight
          if (out) localOutputs.set(predId, out)
        } catch {
          // predecessor run failed elsewhere
        }
      }

      const snap = getActiveTab(appDataRef.current)
      const pred = snap.canvas.nodes.find((n) => n.id === predId)
      if (!pred || pred.data.status !== 'success') {
        throw new Error(`Predecessor not succeeded: ${predId}`)
      }
      const out = nodeToLocalOutput(pred)
      if (out) localOutputs.set(predId, out)
    }

    function schedule(id: string): Promise<LocalOutput | null> {
      const existing = scheduled.get(id)
      if (existing) return existing

      const p = (async () => {
        // @@@chain-signals - per-run promises act as signals; a node awaits only its predecessors
        if (visiting.has(id)) throw new Error(`Cycle detected at node ${id}`)
        visiting.add(id)

        const predIds = predIdsBy.get(id) ?? []
        await Promise.all(
          predIds.map(async (predId) => {
            if (reachable.has(predId)) {
              await schedule(predId)
              return
            }
            await requireExternalPredSuccess(predId)
          }),
        )

        const snap = getActiveTab(appDataRef.current)
        const node = snap.canvas.nodes.find((n) => n.id === id)
        if (!node) throw new Error(`Node not found: ${id}`)

        if (!resetSet.has(id) && node.data.status === 'success') {
          const out = nodeToLocalOutput(node)
          if (out) localOutputs.set(id, out)
        } else {
          if (node.data.locked) {
            throw new Error(`Locked node must already be succeeded: ${id}`)
          }
          const out = await runNode(id, 'chain', localOutputs)
          if (out) localOutputs.set(id, out)
        }

        visiting.delete(id)

        return localOutputs.get(id) ?? null
      })()

      scheduled.set(id, p)
      return p
    }

    // @@@no-main-thread - independent chains just call runFrom; we don't serialize globally
    const ids = [...reachable]
    await Promise.allSettled(ids.map((id) => schedule(id)))
  }

  const selectedNode = selected
    ? activeTab.canvas.nodes.find((n) => n.id === selected.nodeId) ?? null
    : null

  const sidebar = selectedNode ? (
    <div className="sfSidebar">
      <div>
        <div className="sfHeader">{selectedNode.data.title}</div>

        <label className="sfLabel">
          <div>locked</div>
          <input
            type="checkbox"
            checked={!!selectedNode.data.locked}
            onChange={(e) =>
              patchSelectedNode((n) => ({ ...n, data: { ...n.data, locked: e.target.checked } } as AppNode))
            }
          />
        </label>

        <div className="sfSectionTitle">Settings</div>

        {selectedNode.type === 'code-search' ? (
          <>
            <label className="sfLabel">
              repoPath
              <input
                className="sfInput"
                value={selectedNode.data.repoPath ?? ''}
                disabled={!!selectedNode.data.locked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'code-search'
                      ? { ...n, data: { ...n.data, repoPath: e.target.value } }
                      : n,
                  )
                }
              />
            </label>
            <label className="sfLabel">
              query
              <textarea
                className="sfTextarea"
                value={selectedNode.data.query ?? ''}
                disabled={!!selectedNode.data.locked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'code-search'
                      ? { ...n, data: { ...n.data, query: e.target.value } }
                      : n,
                  )
                }
                rows={5}
              />
            </label>
            <label className="sfLabel">
              <div>debugMessages</div>
              <input
                type="checkbox"
                checked={!!selectedNode.data.debugMessages}
                disabled={!!selectedNode.data.locked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'code-search'
                      ? { ...n, data: { ...n.data, debugMessages: e.target.checked } }
                      : n,
                  )
                }
              />
            </label>
          </>
        ) : null}

        {selectedNode.type === 'context-converter' ? (
          <label className="sfLabel">
            <div>fullFile</div>
            <input
              type="checkbox"
              checked={!!selectedNode.data.fullFile}
              disabled={!!selectedNode.data.locked}
              onChange={(e) =>
                patchSelectedNode((n) =>
                  n.type === 'context-converter'
                    ? { ...n, data: { ...n.data, fullFile: e.target.checked } }
                    : n,
                )
              }
            />
          </label>
        ) : null}

        {selectedNode.type === 'instruction' ? (
          <label className="sfLabel">
            text
            <textarea
              className="sfTextarea"
              value={selectedNode.data.text ?? ''}
              disabled={!!selectedNode.data.locked}
              onChange={(e) =>
                patchSelectedNode((n) =>
                  n.type === 'instruction'
                    ? { ...n, data: { ...n.data, text: e.target.value } }
                    : n,
                )
              }
              rows={8}
            />
          </label>
        ) : null}

        {selectedNode.type === 'llm' ? (
          <>
            <label className="sfLabel">
              model
              <input
                className="sfInput"
                value={selectedNode.data.model ?? ''}
                disabled={!!selectedNode.data.locked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'llm'
                      ? { ...n, data: { ...n.data, model: e.target.value } }
                      : n,
                  )
                }
              />
            </label>
            <label className="sfLabel">
              systemPrompt
              <textarea
                className="sfTextarea"
                value={selectedNode.data.systemPrompt ?? ''}
                disabled={!!selectedNode.data.locked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'llm'
                      ? { ...n, data: { ...n.data, systemPrompt: e.target.value } }
                      : n,
                  )
                }
                rows={6}
              />
            </label>
            <label className="sfLabel">
              query
              <textarea
                className="sfTextarea"
                value={selectedNode.data.query ?? ''}
                disabled={!!selectedNode.data.locked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'llm'
                      ? { ...n, data: { ...n.data, query: e.target.value } }
                      : n,
                  )
                }
                rows={4}
              />
            </label>
          </>
        ) : null}

        <div className="sfSectionTitle">Output</div>
        {selectedNode.data.error ? (
          <pre className="sfOutput sfOutputError">{selectedNode.data.error}</pre>
        ) : null}

        {selectedNode.type === 'code-search' ? (
          <pre className="sfOutput">
            {selectedNode.data.output
              ? JSON.stringify(selectedNode.data.output, null, 2)
              : '(no output)'}
          </pre>
        ) : null}

        {selectedNode.type === 'context-converter' ? (
          <pre className="sfOutput">
            {selectedNode.data.output ?? '(no output)'}
          </pre>
        ) : null}

        {selectedNode.type === 'instruction' ? (
          <pre className="sfOutput">
            {selectedNode.data.output ?? '(no output)'}
          </pre>
        ) : null}

        {selectedNode.type === 'llm' ? (
          <pre className="sfOutput">{selectedNode.data.output ?? '(no output)'}</pre>
        ) : null}

        <div className="sfButtons">
          <button
            onClick={() => {
              runNode(selectedNode.id).catch(() => {})
            }}
            disabled={!!selectedNode.data.locked}
          >
            Run
          </button>
          <button
            onClick={() => {
              runFrom(selectedNode.id).catch(() => {})
            }}
            disabled={!!selectedNode.data.locked}
          >
            Chain
          </button>
          <button
            onClick={() => {
              const text =
                selectedNode.type === 'code-search'
                  ? JSON.stringify(selectedNode.data.output, null, 2)
                  : (selectedNode.data.output ?? '')
              navigator.clipboard.writeText(text)
            }}
          >
            Copy
          </button>
          <button onClick={deleteSelectedNode}>Delete</button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="sfRoot">
      <div className="sfTabs">
        {appData.tabs.map((t) => (
          <div
            key={t.id}
            className={t.id === appData.activeTabId ? 'sfTab sfTabActive' : 'sfTab'}
            onClick={() => setActiveTabId(t.id)}
          >
            <span
              className="sfTabName"
              onDoubleClick={(e) => {
                e.stopPropagation()
                renameTab(t.id)
              }}
              title="Double-click to rename"
            >
              {t.name}
            </span>
            <button
              className="sfTabClose"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="sfTabAdd" onClick={addTab}>
          +
        </button>
      </div>

      <div className="sfBody">
        <div className="sfCanvas">
          {loadError ? <div className="sfLoadErrorBanner">{loadError}</div> : null}
          <div className="sfToolbar">
            <button onClick={() => addNode('code-search')}>🔍</button>
            <button onClick={() => addNode('context-converter')}>📄</button>
            <button onClick={() => addNode('instruction')}>📝</button>
            <button onClick={() => addNode('llm')}>🤖</button>
            <div className="sfToolbarSpacer" />
            <button onClick={resetActiveCanvasAll}>Reset</button>
          </div>

          <ReactFlow
            nodes={activeTab.canvas.nodes.map((n) => ({
              ...n,
              draggable: !n.data.locked,
            }))}
            edges={activeTab.canvas.edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onSelectionChange={(params) => {
              const nodes = params.nodes
              setSelected((prev) => {
                if (nodes.length === 1) {
                  const nodeId = nodes[0].id
                  if (prev?.nodeId === nodeId) return prev
                  return { nodeId }
                }
                return prev === null ? prev : null
              })
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {sidebar}
      </div>
    </div>
  )
}
