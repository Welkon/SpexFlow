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
import { defaultAppData } from './defaultData'
import type { AppData, AppNode, Tab } from './types'
import { buildRepoContext, fetchAppData, runCodeSearch, runLLM, saveAppData } from './api'
import { CodeSearchNodeView, ContextConverterNodeView, LLMNodeView } from './nodes'

type Selected = { nodeId: string } | null

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

function successors(nodes: AppNode[], edges: Edge[], nodeId: string) {
  const targets = edges.filter((e) => e.source === nodeId).map((e) => e.target)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return targets.map((id) => byId.get(id)).filter(Boolean) as AppNode[]
}

function canRunFromPredecessors(preds: AppNode[]) {
  if (preds.length === 0) return true
  return preds.every((p) => p.data.status === 'success')
}

function concatPredecessorOutputs(preds: AppNode[]) {
  const parts: string[] = []
  for (const p of preds) {
    if (p.type === 'context-converter' || p.type === 'llm') {
      if (typeof p.data.output === 'string' && p.data.output.trim()) parts.push(p.data.output)
    }
  }
  return parts.join('\n\n')
}

export function SpecFlowApp() {
  const [appData, setAppData] = useState<AppData>(() => defaultAppData())
  const appDataRef = useRef(appData)
  const [selected, setSelected] = useState<Selected>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const inFlightRuns = useRef(new Map<string, Promise<void>>())

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
      canvas: { nodes: [], edges: [] },
    }
    setAppData((d) => ({ ...d, tabs: [...d.tabs, tab], activeTabId: id }))
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
          repoPath: '',
          query: '',
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
          fullFile: true,
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
          model: 'anthropic/claude-3.5-haiku',
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

  async function runNode(nodeId: string) {
    const existing = inFlightRuns.current.get(nodeId)
    if (existing) return existing

    const promise = (async () => {
      const snapshot = getActiveTab(appDataRef.current)
      const node = snapshot.canvas.nodes.find((n) => n.id === nodeId)
      if (!node) throw new Error(`Node not found: ${nodeId}`)

      const preds = predecessors(snapshot.canvas.nodes, snapshot.canvas.edges, nodeId)
      if (!canRunFromPredecessors(preds) && !(node.type === 'code-search' && node.data.query.trim())) {
        throw new Error('Predecessors not succeeded yet.')
      }

      patchNodeById(nodeId, (n) => ({ ...n, data: { ...n.data, status: 'running', error: null } }))

      try {
        if (node.type === 'code-search') {
          const input = concatPredecessorOutputs(preds)
          const query = node.data.query.trim() ? node.data.query.trim() : input.trim()
          const finalQuery =
            query || window.prompt('Code search query?') || ''
          if (!finalQuery.trim()) throw new Error('Empty query')

          let repoPath = (node.data.repoPath || '').trim()
          if (!repoPath) {
            repoPath = window.prompt('Repo path?', 'examples/example-repo') || ''
            if (!repoPath.trim()) throw new Error('Empty repoPath')
          }
          const result = await runCodeSearch({ repoPath, query: finalQuery })
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
          return
        }

        if (node.type === 'context-converter') {
          const searchPreds = preds.filter((p) => p.type === 'code-search') as Extract<AppNode, { type: 'code-search' }>[]
          if (searchPreds.length === 0) throw new Error('Context converter requires a code-search predecessor.')

          const contexts = await Promise.all(
            searchPreds.map(async (p) => {
              if (!p.data.output) throw new Error('Code-search predecessor has no output.')
              return buildRepoContext({
                repoPath: p.data.repoPath,
                explanation: p.data.output.explanation,
                files: p.data.output.files,
                fullFile: node.data.fullFile,
              })
            }),
          )

          patchNodeById(nodeId, (n) => {
            if (n.type !== 'context-converter') return n
            return {
              ...n,
              data: {
                ...n.data,
                output: contexts.join('\n\n---\n\n'),
                status: 'success',
                error: null,
              },
            }
          })
          return
        }

        const context = concatPredecessorOutputs(preds)
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
      } catch (err: any) {
        const message = String(err?.message ?? err)
        patchNodeById(nodeId, (n) => ({ ...n, data: { ...n.data, status: 'error', error: message } }))
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
    const snapshot = getActiveTab(appDataRef.current)
    const visited = new Set<string>()

    async function walk(id: string) {
      if (visited.has(id)) return
      visited.add(id)

      await runNode(id)

      const snap2 = getActiveTab(appDataRef.current)
      const next = successors(snap2.canvas.nodes, snap2.canvas.edges, id)
      await Promise.all(
        next.map(async (n) => {
          const preds = predecessors(snap2.canvas.nodes, snap2.canvas.edges, n.id)
          if (!canRunFromPredecessors(preds)) return
          await walk(n.id)
        }),
      )
    }

    // @@@no-main-thread - independent chains just call runFrom; we don't serialize globally
    await walk(nodeId)
  }

  const selectedNode = selected
    ? activeTab.canvas.nodes.find((n) => n.id === selected.nodeId) ?? null
    : null

  const sidebar = (
    <div className="sfSidebar">
      {loadError ? (
        <div className="sfError">Failed to load data: {loadError}</div>
      ) : null}

      {!selectedNode ? (
        <div className="sfEmpty">Select a node.</div>
      ) : (
        <div>
          <div className="sfHeader">{selectedNode.data.title}</div>
          <div className="sfSectionTitle">Settings</div>

          {selectedNode.type === 'code-search' ? (
            <>
              <label className="sfLabel">
                repoPath
                <input
                  className="sfInput"
                  value={selectedNode.data.repoPath}
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
                  value={selectedNode.data.query}
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
            </>
          ) : null}

          {selectedNode.type === 'context-converter' ? (
            <label className="sfLabel">
              <div>fullFile</div>
              <input
                type="checkbox"
                checked={selectedNode.data.fullFile}
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

          {selectedNode.type === 'llm' ? (
            <>
              <label className="sfLabel">
                model
                <input
                  className="sfInput"
                  value={selectedNode.data.model}
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
                  value={selectedNode.data.systemPrompt}
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
                  value={selectedNode.data.query}
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

          {selectedNode.type === 'llm' ? (
            <pre className="sfOutput">{selectedNode.data.output ?? '(no output)'}</pre>
          ) : null}

          <div className="sfButtons">
            <button onClick={() => runNode(selectedNode.id)}>Run</button>
            <button onClick={() => runFrom(selectedNode.id)}>Chain</button>
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
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="sfRoot">
      <div className="sfTabs">
        {appData.tabs.map((t) => (
          <div
            key={t.id}
            className={t.id === appData.activeTabId ? 'sfTab sfTabActive' : 'sfTab'}
            onClick={() => setActiveTabId(t.id)}
          >
            <span className="sfTabName">{t.name}</span>
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
          <div className="sfToolbar">
            <button onClick={() => addNode('code-search')}>🔍</button>
            <button onClick={() => addNode('context-converter')}>📄</button>
            <button onClick={() => addNode('llm')}>🤖</button>
          </div>

          <ReactFlow
            nodes={activeTab.canvas.nodes}
            edges={activeTab.canvas.edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node) => setSelected({ nodeId: node.id })}
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
