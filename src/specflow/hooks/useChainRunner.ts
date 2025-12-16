import { useCallback, useState } from 'react'
import type { AppData, AppNode, ChainRun, ChainRunStatus, Tab } from '../types'
import type { LocalOutput, RunMode } from './useNodeRunner'
import { ChainCancelledError, getActiveTab, isAbortError, resetNodeRuntime, throwIfAborted, uid } from '../utils'

export function useChainRunner(
  appDataRef: React.RefObject<AppData>,
  updateActiveCanvas: (patch: (tab: Tab) => Tab) => void,
  inFlightRuns: React.RefObject<Map<string, Promise<LocalOutput | null>>>,
  runNode: (
    nodeId: string,
    mode: RunMode,
    localOutputs?: Map<string, LocalOutput>,
    signal?: AbortSignal,
  ) => Promise<LocalOutput | null>,
  nodeToLocalOutput: (node: AppNode) => LocalOutput | null,
) {
  const [chainRuns, setChainRuns] = useState<ChainRun[]>([])

  const updateChainRun = useCallback((chainId: string, patch: (r: ChainRun) => ChainRun) => {
    setChainRuns((runs) => runs.map((r) => (r.id === chainId ? patch(r) : r)))
  }, [])

  const markChainCompleted = useCallback(
    (chainId: string, nodeId: string) => {
      updateChainRun(chainId, (r) =>
        r.completedNodeIds.includes(nodeId)
          ? r
          : { ...r, completedNodeIds: [...r.completedNodeIds, nodeId] },
      )
    },
    [updateChainRun],
  )

  const markChainFailed = useCallback(
    (chainId: string, nodeId: string) => {
      updateChainRun(chainId, (r) =>
        r.failedNodeIds.includes(nodeId) ? r : { ...r, failedNodeIds: [...r.failedNodeIds, nodeId] },
      )
    },
    [updateChainRun],
  )

  const cancelChain = useCallback((chainId: string) => {
    setChainRuns((runs) =>
      runs.map((r) => {
        if (r.id !== chainId) return r
        if (r.status !== 'running') return r
        r.abortController.abort()
        return { ...r, status: 'cancelled' }
      }),
    )
  }, [])

  const runFrom = useCallback(
    async (nodeId: string) => {
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
      ;(function mark(id: string) {
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

      const chainId = globalThis.crypto?.randomUUID?.() ?? uid('chain')
      const abortController = new AbortController()
      const startedAt = new Date().toISOString()

      setChainRuns((runs) => [
        {
          id: chainId,
          startedAt,
          fromNodeId: nodeId,
          fromNodeTitle: start?.data.title ?? nodeId,
          nodeIds: [...reachable],
          completedNodeIds: [],
          failedNodeIds: [],
          status: 'running',
          abortController,
        },
        ...runs,
      ])

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
          try {
            throwIfAborted(abortController.signal)

            const predIds = predIdsBy.get(id) ?? []
            await Promise.all(
              predIds.map(async (predId) => {
                throwIfAborted(abortController.signal)
                if (reachable.has(predId)) {
                  await schedule(predId)
                  return
                }
                await requireExternalPredSuccess(predId)
              }),
            )

            throwIfAborted(abortController.signal)

            const snap = getActiveTab(appDataRef.current)
            const node = snap.canvas.nodes.find((n) => n.id === id)
            if (!node) throw new Error(`Node not found: ${id}`)

            if (!resetSet.has(id) && node.data.status === 'success') {
              const out = nodeToLocalOutput(node)
              if (out) localOutputs.set(id, out)
              markChainCompleted(chainId, id)
            } else {
              if (node.data.locked) {
                throw new Error(`Locked node must already be succeeded: ${id}`)
              }
              const out = await runNode(id, 'chain', localOutputs, abortController.signal)
              if (out) localOutputs.set(id, out)
              markChainCompleted(chainId, id)
            }

            return localOutputs.get(id) ?? null
          } catch (err: unknown) {
            if (err instanceof ChainCancelledError) throw err
            if (abortController.signal.aborted || isAbortError(err)) throw new ChainCancelledError()
            markChainFailed(chainId, id)
            throw err
          } finally {
            visiting.delete(id)
          }
        })()

        scheduled.set(id, p)
        return p
      }

      // @@@no-main-thread - independent chains just call runFrom; we don't serialize globally
      const ids = [...reachable]
      const results = await Promise.allSettled(ids.map((id) => schedule(id)))
      const nextStatus: ChainRunStatus =
        abortController.signal.aborted
          ? 'cancelled'
          : results.some((r) => r.status === 'rejected')
            ? 'error'
            : 'completed'

      updateChainRun(chainId, (r) => (r.status === 'cancelled' ? r : { ...r, status: nextStatus }))
      window.setTimeout(() => {
        setChainRuns((runs) => runs.filter((r) => r.id !== chainId))
      }, 2500)
    },
    [appDataRef, updateActiveCanvas, inFlightRuns, runNode, nodeToLocalOutput, markChainCompleted, markChainFailed, updateChainRun],
  )

  const resetActiveCanvasAll = useCallback(() => {
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
  }, [inFlightRuns, updateActiveCanvas])

  return {
    chainRuns,
    cancelChain,
    runFrom,
    resetActiveCanvasAll,
  }
}
