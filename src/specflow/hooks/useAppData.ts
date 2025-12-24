import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Edge } from '@xyflow/react'
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react'
import type { AppData, AppNode, ArchiveData, ArchiveNode, ArchivedMember, Canvas, NonArchiveNode, Tab, Viewport } from '../types'
import { deleteCanvasFile, fetchAppData, listCanvasFiles, loadCanvasFile, saveAppData, saveCanvasFile, type SavedCanvasFile } from '../api'
import { deepClone, getActiveTab, isValidConnection, uid, updateNode } from '../utils'

export type Selected = { nodeIds: string[]; primaryId: string } | null

function isDimensionChange<N extends AppNode>(c: NodeChange<N>): c is Extract<NodeChange<N>, { type: 'dimensions' }> {
  return c.type === 'dimensions' && !!c.dimensions
}

function emptyCanvas(): Canvas {
  return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
}

function stripCanvasExt(p: string) {
  return p.endsWith('.canvas.json') ? p.slice(0, -'.canvas.json'.length) : p
}

function sanitizeCanvasFileName(name: string) {
  const safe = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return safe || 'canvas'
}

function buildCanvasFile(tab: Tab): SavedCanvasFile {
  return {
    version: 1,
    id: tab.id,
    name: tab.name,
    savedAt: new Date().toISOString(),
    settings: tab.canvasSettings ? { ...tab.canvasSettings } : undefined,
    specs: tab.specs ? deepClone(tab.specs) : undefined,
    canvas: {
      nodes: tab.canvas.nodes,
      edges: tab.canvas.edges,
    },
  }
}

export function useAppData() {
  const [appData, setAppData] = useState<AppData | null>(null)
  const appDataRef = useRef<AppData | null>(appData)
  const [selected, setSelected] = useState<Selected>(null)
  const selectedRef = useRef<Selected>(selected)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const saveTimer = useRef<number | null>(null)

  const activeTab = useMemo(() => (appData ? getActiveTab(appData) : null), [appData])
  const rfNodes = useMemo(
    () =>
      (activeTab?.canvas.nodes ?? []).map((n) => ({
        ...n,
        draggable: !n.data.locked,
      })),
    [activeTab?.canvas.nodes],
  )

  useEffect(() => {
    appDataRef.current = appData
  }, [appData])

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  // Load data on mount
  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setLoadError(null)
    fetchAppData()
      .then(async (data) => {
        if (!alive) return
        if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
          throw new Error('Invalid app data: missing tabs')
        }
        const hydratedTabs: Tab[] = []
        for (const tab of data.tabs) {
          if (!tab.savedFilePath) {
            hydratedTabs.push(tab)
            continue
          }
          const loaded = await loadCanvasFile(tab.savedFilePath)
          if (loaded.id !== tab.id) {
            throw new Error(`Canvas ID mismatch for ${tab.name}`)
          }
          hydratedTabs.push({
            ...tab,
            canvasSettings: loaded.settings ?? tab.canvasSettings,
            specs: loaded.specs ?? tab.specs,
            canvas: {
              ...tab.canvas,
              nodes: loaded.canvas.nodes,
              edges: loaded.canvas.edges,
            },
          })
        }
        const hydrated = { ...data, tabs: hydratedTabs }
        getActiveTab(hydrated)
        appDataRef.current = hydrated
        setAppData(hydrated)
      })
      .catch((e) => {
        if (!alive) return
        setLoadError(String(e?.message ?? e))
        appDataRef.current = null
        setAppData(null)
      })
      .finally(() => {
        if (!alive) return
        setIsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Auto-save
  useEffect(() => {
    if (!appData) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const snap = appDataRef.current
      if (!snap) return
      saveAppData(snap).catch((e) => {
        console.error(e)
      })

      const tab = getActiveTab(snap)
      const canvasFile = buildCanvasFile(tab)
      if (!tab.savedFilePath) {
        const fileName = sanitizeCanvasFileName(tab.name)
        listCanvasFiles()
          .then((list) => {
            const targetPath = `${fileName}.canvas.json`
            const exists = (list.files ?? []).some((f) => f.path === targetPath)
            if (!exists) return null
            return loadCanvasFile(targetPath)
          })
          .then((existing) => {
            if (existing && existing.id !== tab.id) {
              throw new Error(`Canvas name "${tab.name}" is already used by another file`)
            }
            return saveCanvasFile(fileName, canvasFile)
          })
          .then((result) => {
            setAppData((prev) => {
              if (!prev) throw new Error('App data not loaded')
              return {
                ...prev,
                tabs: prev.tabs.map((t) => (t.id === tab.id ? { ...t, savedFilePath: result.path } : t)),
              }
            })
          })
          .catch((e) => {
            console.error(e)
            setLoadError(String((e as Error)?.message ?? e))
          })
        return
      }

      saveCanvasFile(stripCanvasExt(tab.savedFilePath), canvasFile).catch((e) => {
        console.error(e)
        setLoadError(String((e as Error)?.message ?? e))
      })
    }, 400)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [appData])

  const updateActiveCanvas = useCallback((patch: (tab: Tab) => Tab) => {
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      const nextTabs = d.tabs.map((t) => (t.id === d.activeTabId ? patch(t) : t))
      return { ...d, tabs: nextTabs }
    })
  }, [])

  const updateCanvasById = useCallback((tabId: string, patch: (tab: Tab) => Tab) => {
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      const nextTabs = d.tabs.map((t) => (t.id === tabId ? patch(t) : t))
      return { ...d, tabs: nextTabs }
    })
  }, [])

  const updateActiveViewport = useCallback((viewport: Viewport) => {
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      const nextTabs = d.tabs.map((t) => {
        if (t.id !== d.activeTabId) return t
        return {
          ...t,
          canvas: {
            ...t.canvas,
            viewport,
          },
        }
      })
      return { ...d, tabs: nextTabs }
    })
  }, [])

  const setActiveTabId = useCallback((tabId: string) => {
    setSelected(null)
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      return { ...d, activeTabId: tabId }
    })
  }, [])

  const addTab = useCallback(() => {
    const id = uid('tab')
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      const tab: Tab = {
        id,
        name: `Canvas ${d.tabs.length + 1}`,
        createdAt: new Date().toISOString(),
        canvas: emptyCanvas(),
      }
      return { ...d, tabs: [...d.tabs, tab], activeTabId: id }
    })
  }, [])

  const renameCanvas = useCallback(async (tabId: string, nextNameRaw: string) => {
    const snap = appDataRef.current
    if (!snap) throw new Error('App data not loaded')
    const tab = snap.tabs.find((t) => t.id === tabId)
    if (!tab) throw new Error('Canvas not found')
    const nextName = nextNameRaw.trim()
    if (!nextName) throw new Error('Canvas name is required')

    const safeName = sanitizeCanvasFileName(nextName)
    const targetPath = `${safeName}.canvas.json`
    const existingList = await listCanvasFiles()
    const conflict = (existingList.files ?? []).some((f) => f.path === targetPath)
    if (conflict) {
      const existing = await loadCanvasFile(targetPath)
      if (existing.id !== tab.id) throw new Error(`Canvas name "${nextName}" is already used`)
    }

    const canvasFile = buildCanvasFile({ ...tab, name: nextName })
    await saveCanvasFile(safeName, canvasFile)

    if (tab.savedFilePath && tab.savedFilePath !== targetPath) {
      await deleteCanvasFile(tab.savedFilePath)
    }

    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      return {
        ...d,
        tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, name: nextName, savedFilePath: targetPath } : t)),
      }
    })
  }, [])

  const closeTab = useCallback((tabId: string) => {
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      const nextTabs = d.tabs.filter((t) => t.id !== tabId)
      const nextActive = d.activeTabId === tabId ? (nextTabs[0]?.id ?? null) : d.activeTabId
      return { ...d, tabs: nextTabs, activeTabId: nextActive }
    })
    setSelected(null)
  }, [])

  const deleteSelectedNodes = useCallback(() => {
    const sel = selectedRef.current
    if (!sel) return
    const nodeIds = sel.nodeIds
    const selectedSet = new Set(nodeIds)
    updateActiveCanvas((t) => ({
      ...t,
      canvas: {
        ...t.canvas,
        nodes: t.canvas.nodes.filter((n) => !selectedSet.has(n.id)),
        edges: t.canvas.edges.filter((e) => !selectedSet.has(e.source) && !selectedSet.has(e.target)),
      },
    }))
    setSelected(null)
  }, [updateActiveCanvas])

  const archiveSelectedNodes = useCallback(() => {
    const sel = selectedRef.current
    if (!sel || sel.nodeIds.length < 1) return

    updateActiveCanvas((t) => {
      const selectedSet = new Set(sel.nodeIds)
      const nodesToArchive = t.canvas.nodes.filter((n) => selectedSet.has(n.id))
      if (nodesToArchive.length === 0) return t

      // Flatten all members - this ensures associativity
      // archive(archive(A,B), C) = archive(A, B, C) because we flatten
      const allMembers: ArchivedMember[] = []
      const now = new Date().toISOString()

      for (const node of nodesToArchive) {
        if (node.type === 'archive') {
          allMembers.push(...(node.data as ArchiveData).members)
          continue
        }
        const snapshot = { ...(node.data as Record<string, unknown>) }
        allMembers.push({
          id: node.id,
          type: node.type as NonArchiveNode['type'],
          title: node.data.title,
          customName: node.data.customName,
          status: node.data.status,
          archivedAt: now,
          snapshot,
        })
      }

      const avgX = nodesToArchive.reduce((sum, n) => sum + n.position.x, 0) / nodesToArchive.length
      const avgY = nodesToArchive.reduce((sum, n) => sum + n.position.y, 0) / nodesToArchive.length

      const archiveNode: ArchiveNode = {
        id: uid('n'),
        type: 'archive',
        position: { x: avgX, y: avgY },
        data: {
          title: 'Archive',
          status: 'idle',
          error: null,
          locked: false,
          muted: false,
          members: allMembers,
          output: null,
        },
      }

      const remainingNodes = t.canvas.nodes.filter((n) => !selectedSet.has(n.id))
      const remainingEdges = t.canvas.edges.filter((e) => !selectedSet.has(e.source) && !selectedSet.has(e.target))

      return {
        ...t,
        canvas: {
          ...t.canvas,
          nodes: [...remainingNodes, archiveNode],
          edges: remainingEdges,
        },
      }
    })

    setSelected(null)
  }, [updateActiveCanvas])

  const unarchiveNode = useCallback(
    (archiveNodeId: string, memberIdToUnarchive: string) => {
      updateActiveCanvas((t) => {
        const archiveNode = t.canvas.nodes.find((n) => n.id === archiveNodeId)
        if (!archiveNode || archiveNode.type !== 'archive') return t

        const memberToRestore = archiveNode.data.members.find((m) => m.id === memberIdToUnarchive)
        if (!memberToRestore) return t

        const snapshot = { ...(memberToRestore.snapshot ?? {}) }
        const restoredData: Record<string, unknown> = {
          ...snapshot,
          status: 'idle',
          error: null,
          output: null,
        }
        if (memberToRestore.type === 'context-converter') {
          restoredData.mergedFiles = undefined
          restoredData.contextSources = undefined
          restoredData.repoPaths = undefined
        }

        const restoredNode: AppNode = {
          id: uid('n'),
          type: memberToRestore.type,
          position: { x: archiveNode.position.x + 50, y: archiveNode.position.y + 50 },
          data: restoredData as any,
        }

        const remainingMembers = archiveNode.data.members.filter((m) => m.id !== memberIdToUnarchive)

        const updatedNodes =
          remainingMembers.length === 0
            ? t.canvas.nodes.filter((n) => n.id !== archiveNodeId)
            : t.canvas.nodes.map((n) => {
                if (n.id !== archiveNodeId) return n
                if (n.type !== 'archive') return n
                const nextArchiveData: ArchiveData = {
                  // @@@archive-stale-output - unarchiving changes members; reset runtime/output to avoid stale summaries
                  ...n.data,
                  members: remainingMembers,
                  status: 'idle',
                  error: null,
                  output: null,
                }
                return { ...n, data: nextArchiveData }
              })

        return {
          ...t,
          canvas: {
            ...t.canvas,
            nodes: [...updatedNodes, restoredNode],
          },
        }
      })
    },
    [updateActiveCanvas],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      updateActiveCanvas((t) => {
        let nodes = applyNodeChanges(changes, t.canvas.nodes)
        const dim = changes.filter(isDimensionChange)
        if (dim.length > 0) {
          const byId = new Map(dim.map((c) => [c.id, c.dimensions]))
          nodes = nodes.map((n) => {
            const d = byId.get(n.id)
            if (!d) return n
            return { ...n, data: { ...n.data, width: d.width, height: d.height } } as AppNode
          })
        }
        return { ...t, canvas: { ...t.canvas, nodes } }
      })
    },
    [updateActiveCanvas],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      updateActiveCanvas((t) => ({
        ...t,
        canvas: { ...t.canvas, edges: applyEdgeChanges(changes, t.canvas.edges) },
      }))
    },
    [updateActiveCanvas],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      const snap = appDataRef.current
      if (!snap) throw new Error('App data not loaded')
      const tab = getActiveTab(snap)
      const sourceNode = tab.canvas.nodes.find((n) => n.id === params.source)
      const targetNode = tab.canvas.nodes.find((n) => n.id === params.target)
      if (!sourceNode || !targetNode) return

      const result = isValidConnection(sourceNode.type, targetNode.type)
      if (!result.valid) {
        alert(result.reason)
        return
      }

      updateActiveCanvas((t) => ({
        ...t,
        canvas: { ...t.canvas, edges: addEdge(params, t.canvas.edges) },
      }))
    },
    [appDataRef, updateActiveCanvas],
  )

  const addNode = useCallback(
    (type: NonArchiveNode['type'], liveViewport?: Viewport) => {
      const snap = appDataRef.current
      if (!snap) throw new Error('App data not loaded')
      const tabSnap = getActiveTab(snap)
      const defaultRepoPath = tabSnap.canvasSettings?.defaultRepoPath ?? ''
      const id = uid('n')
      // Place new node at viewport center (use live viewport if provided, else fall back to saved)
      const viewport = liveViewport ?? tabSnap.canvas.viewport ?? { x: 0, y: 0, zoom: 1 }
      const centerX = (-viewport.x + 400) / viewport.zoom
      const centerY = (-viewport.y + 300) / viewport.zoom
      // Add small offset based on existing node count to avoid stacking
      const offset = (tabSnap.canvas.nodes.length % 5) * 30
      const base = {
        id,
        type,
        position: { x: centerX + offset, y: centerY + offset },
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
            muted: false,
            repoPath: defaultRepoPath,
            query: '',
            debugMessages: false,
            output: null,
          },
        }
      } else if (type === 'code-search-conductor') {
        node = {
          ...base,
          type,
          data: {
            title: 'Search Conductor',
            status: 'idle',
            error: null,
            locked: false,
            muted: false,
            model: 'x-ai/grok-4.1-fast',
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
            locked: false,
            muted: false,
            fullFile: false,
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
            muted: false,
            text: '',
            output: null,
          },
        }
      } else if (type === 'manual-import') {
        node = {
          ...base,
          type,
          data: {
            title: 'Manual Import',
            status: 'idle',
            error: null,
            locked: false,
            muted: false,
            repoPath: defaultRepoPath,
            items: [],
            output: null,
          },
        }
      } else {
        if (type !== 'llm') throw new Error(`Unsupported node type: ${type}`)
        node = {
          ...base,
          type,
          data: {
            title: 'LLM',
            status: 'idle',
            error: null,
            locked: false,
            muted: false,
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
      setSelected({ nodeIds: [id], primaryId: id })
    },
    [updateActiveCanvas],
  )

  const patchSelectedNode = useCallback(
    (patch: (n: AppNode) => AppNode) => {
      const sel = selectedRef.current
      if (!sel || sel.nodeIds.length !== 1) return
      updateActiveCanvas((t) => ({
        ...t,
        canvas: {
          ...t.canvas,
          nodes: updateNode(t.canvas.nodes, sel.primaryId, patch),
        },
      }))
    },
    [updateActiveCanvas],
  )

  const patchNodeById = useCallback(
    (nodeId: string, patch: (n: AppNode) => AppNode) => {
      updateActiveCanvas((t) => ({
        ...t,
        canvas: {
          ...t.canvas,
          nodes: updateNode(t.canvas.nodes, nodeId, patch),
        },
      }))
    },
    [updateActiveCanvas],
  )

  const patchNodeByIdInTab = useCallback(
    (tabId: string, nodeId: string, patch: (n: AppNode) => AppNode) => {
      updateCanvasById(tabId, (t) => ({
        ...t,
        canvas: {
          ...t.canvas,
          nodes: updateNode(t.canvas.nodes, nodeId, patch),
        },
      }))
    },
    [updateCanvasById],
  )

  const loadCanvas = useCallback(async (filePath: string) => {
    const loaded = await loadCanvasFile(filePath)

    const existing = appDataRef.current?.tabs.find((t) => t.id === loaded.id) ?? null
    if (existing) {
      setSelected(null)
      setAppData((prev) => {
        if (!prev) throw new Error('App data not loaded')
        return {
          ...prev,
          activeTabId: existing.id,
          tabs: prev.tabs.map((t) => (t.id === existing.id ? { ...t, savedFilePath: filePath } : t)),
        }
      })
      return { switched: true as const }
    }

    const now = new Date().toISOString()
    const newTab: Tab = {
      id: loaded.id,
      name: loaded.name,
      createdAt: now,
      savedFilePath: filePath,
      canvasSettings: loaded.settings ?? undefined,
      specs: loaded.specs ?? undefined,
      canvas: {
        nodes: loaded.canvas.nodes,
        edges: loaded.canvas.edges,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    }

    setSelected(null)
    setAppData((prev) => {
      if (!prev) throw new Error('App data not loaded')
      return {
        ...prev,
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      }
    })
    return { switched: false as const }
  }, [])

  const deleteCanvas = useCallback(async (tabId: string) => {
    const snap = appDataRef.current
    if (!snap) throw new Error('App data not loaded')
    if (snap.tabs.length <= 1) throw new Error('Cannot delete the last canvas')
    const tab = snap.tabs.find((t) => t.id === tabId)
    if (!tab) throw new Error('Canvas not found')
    if (tab.savedFilePath) {
      await deleteCanvasFile(tab.savedFilePath)
    }

    setSelected(null)
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      const nextTabs = d.tabs.filter((t) => t.id !== tabId)
      const nextActive = d.activeTabId === tabId ? (nextTabs[0]?.id ?? null) : d.activeTabId
      return { ...d, tabs: nextTabs, activeTabId: nextActive }
    })
  }, [])

  const duplicateCanvas = useCallback(async (tabId: string, nextNameRaw: string) => {
    const snap = appDataRef.current
    if (!snap) throw new Error('App data not loaded')
    const tab = snap.tabs.find((t) => t.id === tabId)
    if (!tab) throw new Error('Canvas not found')
    const nextName = nextNameRaw.trim()
    if (!nextName) throw new Error('Canvas name is required')

    const safeName = sanitizeCanvasFileName(nextName)
    const targetPath = `${safeName}.canvas.json`
    const existingList = await listCanvasFiles()
    const conflict = (existingList.files ?? []).some((f) => f.path === targetPath)
    if (conflict) throw new Error(`Canvas name "${nextName}" is already used`)

    const now = new Date().toISOString()
    const newId = uid('tab')
    const canvas = deepClone(tab.canvas)
    const newTab: Tab = {
      id: newId,
      name: nextName,
      createdAt: now,
      savedFilePath: targetPath,
      canvasSettings: tab.canvasSettings ? deepClone(tab.canvasSettings) : undefined,
      specs: tab.specs ? deepClone(tab.specs) : undefined,
      canvas,
    }

    const canvasFile = buildCanvasFile(newTab)
    await saveCanvasFile(safeName, canvasFile)

    setSelected(null)
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      return {
        ...d,
        tabs: [...d.tabs, newTab],
        activeTabId: newTab.id,
      }
    })
  }, [])

  const updateCanvasSettings = useCallback((tabId: string, patch: { defaultRepoPath?: string }) => {
    setAppData((d) => {
      if (!d) throw new Error('App data not loaded')
      return {
        ...d,
        tabs: d.tabs.map((t) => {
          if (t.id !== tabId) return t
          return {
            ...t,
            canvasSettings: {
              ...(t.canvasSettings ?? {}),
              ...patch,
            },
          }
        }),
      }
    })
  }, [])

  return {
    appData,
    setAppData,
    appDataRef,
    isLoading,
    activeTab,
    rfNodes,
    selected,
    setSelected,
    selectedRef,
    loadError,
    setActiveTabId,
    addTab,
    closeTab,
    deleteSelectedNodes,
    updateActiveCanvas,
    updateCanvasById,
    updateActiveViewport,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    patchSelectedNode,
    patchNodeById,
    patchNodeByIdInTab,
    archiveSelectedNodes,
    unarchiveNode,
    loadCanvas,
    renameCanvas,
    deleteCanvas,
    duplicateCanvas,
    updateCanvasSettings,
  }
}
