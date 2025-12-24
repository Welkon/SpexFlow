import { useCallback, useRef, useState } from 'react'
import type { AppData, AppNode, Spec, SpecRunResult, Tab } from '../types'
import { resetNodeRuntime, uid, updateNode } from '../utils'

const CONTENT_FIELD: Record<string, 'text' | 'query'> = {
  instruction: 'text',
  llm: 'query',
  'code-search': 'query',
  'code-search-conductor': 'query',
}

const OUTPUT_TYPES = new Set<AppNode['type']>([
  'instruction',
  'llm',
  'context-converter',
  'code-search',
  'manual-import',
])

function getSpec(tab: Tab, specId: string) {
  const spec = (tab.specs ?? []).find((s) => s.id === specId)
  if (!spec) throw new Error(`Spec not found: ${specId}`)
  return spec
}

function getOutputValue(node: AppNode): string {
  if (node.data.muted) return ''
  if (node.type === 'instruction' || node.type === 'llm' || node.type === 'context-converter') {
    return node.data.output ?? ''
  }
  if (node.type === 'code-search' || node.type === 'manual-import') {
    return node.data.output ? JSON.stringify(node.data.output, null, 2) : ''
  }
  throw new Error(`Unsupported output node type: ${node.type}`)
}

export function useSpecRunner(
  appDataRef: React.RefObject<AppData>,
  activeTabId: string,
  patchNodeByIdInTab: (tabId: string, nodeId: string, patch: (n: AppNode) => AppNode) => void,
  runFrom: (nodeId: string) => Promise<void>,
  updateTabById: (tabId: string, patch: (tab: Tab) => Tab) => void,
) {
  const [runningSpecId, setRunningSpecId] = useState<string | null>(null)
  const runningSpecIdRef = useRef<string | null>(null)
  const cancelledSpecIdsRef = useRef(new Set<string>())

  const setRunningSpec = useCallback((specId: string | null) => {
    runningSpecIdRef.current = specId
    setRunningSpecId(specId)
  }, [])

  const updateSpecInTab = useCallback(
    (tabId: string, specId: string, patch: (spec: Spec) => Spec) => {
      updateTabById(tabId, (tab) => ({
        ...tab,
        specs: (tab.specs ?? []).map((spec) => (spec.id === specId ? patch(spec) : spec)),
      }))
    },
    [updateTabById],
  )

  const patchNodeInTab = useCallback(
    (tabId: string, nodeId: string, patch: (n: AppNode) => AppNode) => {
      const snap = appDataRef.current
      if (!snap) throw new Error('App data not loaded')
      const nextTabs = snap.tabs.map((tab) => {
        if (tab.id !== tabId) return tab
        return {
          ...tab,
          canvas: {
            ...tab.canvas,
            nodes: updateNode(tab.canvas.nodes, nodeId, patch),
          },
        }
      })
      appDataRef.current = { ...snap, tabs: nextTabs }
      patchNodeByIdInTab(tabId, nodeId, patch)
    },
    [appDataRef, patchNodeByIdInTab],
  )

  const runSpecInTab = useCallback(
    async (tabId: string, specId: string) => {
      const snap = appDataRef.current
      if (!snap) throw new Error('App data not loaded')
      const tab = snap.tabs.find((t) => t.id === tabId)
      if (!tab) throw new Error(`Tab not found: ${tabId}`)
      const spec = getSpec(tab, specId)

      if (runningSpecIdRef.current && runningSpecIdRef.current !== specId) {
        updateSpecInTab(tabId, specId, (s) => ({
          ...s,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        }))
        return
      }
      if (runningSpecIdRef.current === specId) return

      if (snap.activeTabId !== tabId) {
        updateSpecInTab(tabId, specId, (s) => ({
          ...s,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        }))
        return
      }

      const inputNode = tab.canvas.nodes.find((n) => n.id === spec.inputNodeId)
      if (!inputNode) {
        const error = `Input node not found: ${spec.inputNodeId}`
        const now = new Date().toISOString()
        const result: SpecRunResult = {
          runId: uid('spec_run'),
          startedAt: now,
          finishedAt: now,
          outputs: {},
          error,
        }
        updateSpecInTab(tabId, specId, (s) => ({
          ...s,
          status: 'error',
          runHistory: [result, ...s.runHistory],
          updatedAt: now,
        }))
        return
      }

      if (!CONTENT_FIELD[inputNode.type]) {
        throw new Error(`Invalid input node type: ${inputNode.type}`)
      }

      const startedAt = new Date().toISOString()
      setRunningSpec(specId)
      updateSpecInTab(tabId, specId, (s) => ({ ...s, status: 'running', updatedAt: startedAt }))

      // @@@spec-inject - sync ref, reset runtime, and inject spec content before chain run
      patchNodeInTab(tabId, inputNode.id, (node) => {
        const base = resetNodeRuntime(node)
        if (base.type === 'instruction') {
          return { ...base, data: { ...base.data, text: spec.content } }
        }
        if (base.type === 'llm') {
          return { ...base, data: { ...base.data, query: spec.content } }
        }
        if (base.type === 'code-search') {
          return { ...base, data: { ...base.data, query: spec.content } }
        }
        if (base.type === 'code-search-conductor') {
          return { ...base, data: { ...base.data, query: spec.content } }
        }
        return base
      })

      let error: string | undefined
      try {
        await runFrom(inputNode.id)
      } catch (err) {
        error = String((err as Error)?.message ?? err)
        console.error(err)
      }

      if (cancelledSpecIdsRef.current.has(specId)) {
        cancelledSpecIdsRef.current.delete(specId)
        setRunningSpec(null)
        return
      }

      const snapAfter = appDataRef.current
      if (!snapAfter) throw new Error('App data not loaded')
      const tabAfter = snapAfter.tabs.find((t) => t.id === tabId)
      if (!tabAfter) throw new Error(`Tab not found: ${tabId}`)

      let outputs: Record<string, string> = {}
      let outputError: string | undefined
      try {
        outputs = {}
        for (const mapping of spec.outputs) {
          const node = tabAfter.canvas.nodes.find((n) => n.id === mapping.nodeId)
          if (!node) {
            outputs[mapping.label] = ''
            continue
          }
          if (!OUTPUT_TYPES.has(node.type)) {
            throw new Error(`Unsupported output node type: ${node.type}`)
          }
          outputs[mapping.label] = getOutputValue(node)
        }
      } catch (err) {
        outputError = String((err as Error)?.message ?? err)
        console.error(err)
      }

      const finishedAt = new Date().toISOString()
      const combinedError = [error, outputError].filter(Boolean).join(' | ') || undefined
      const result: SpecRunResult = {
        runId: uid('spec_run'),
        startedAt,
        finishedAt,
        outputs,
        ...(combinedError ? { error: combinedError } : {}),
      }

      updateSpecInTab(tabId, specId, (s) => ({
        ...s,
        status: combinedError ? 'error' : 'finished',
        runHistory: [result, ...s.runHistory],
        updatedAt: finishedAt,
      }))

      setRunningSpec(null)

      const nextSnap = appDataRef.current
      const nextTab = nextSnap?.tabs.find((t) => t.id === tabId)
      const nextPending = nextTab?.specs?.find((s) => s.status === 'pending')
      if (nextPending) {
        void runSpecInTab(tabId, nextPending.id)
      }
    },
    [appDataRef, patchNodeInTab, runFrom, setRunningSpec, updateSpecInTab],
  )

  const runSpec = useCallback(
    async (specId: string) => {
      if (!activeTabId) throw new Error('Active tab not set')
      await runSpecInTab(activeTabId, specId)
    },
    [activeTabId, runSpecInTab],
  )

  const cancelSpec = useCallback(
    (specId: string) => {
      const snap = appDataRef.current
      if (!snap) throw new Error('App data not loaded')
      const tabId = snap.activeTabId
      if (!tabId) throw new Error('Active tab not set')

      if (runningSpecIdRef.current === specId) {
        cancelledSpecIdsRef.current.add(specId)
      }

      updateSpecInTab(tabId, specId, (s) => ({
        ...s,
        status: 'ready',
        updatedAt: new Date().toISOString(),
      }))
    },
    [appDataRef, updateSpecInTab],
  )

  return { runningSpecId, runSpec, cancelSpec }
}
