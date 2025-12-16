import { useCallback, useRef } from 'react'
import type { AppData, AppNode, CodeSearchOutput } from '../types'
import { buildRepoContext, runCodeSearch, runConductor, runLLM, resolveManualImport } from '../api'
import { mergeCodeSearchOutputs } from '../../../shared/rangeUtils'
import {
  ChainCancelledError,
  getActiveTab,
  isAbortError,
  predecessors,
  canRunFromPredecessors,
  throwIfAborted,
} from '../utils'

export type LocalOutput =
  | { kind: 'string'; value: string }
  | { kind: 'code-search'; value: CodeSearchOutput; repoPath: string }
  | { kind: 'conductor'; value: Record<string, string> }

export type RunMode = 'single' | 'chain'

// Empty output definitions for muted nodes
const EMPTY_STRING_OUTPUT: LocalOutput = { kind: 'string', value: '' }
const EMPTY_CODE_SEARCH_OUTPUT: CodeSearchOutput = { explanation: '', files: {} }
const EMPTY_CODE_SEARCH_LOCAL_OUTPUT: LocalOutput = { kind: 'code-search', value: EMPTY_CODE_SEARCH_OUTPUT, repoPath: '' }
const EMPTY_CONDUCTOR_OUTPUT: Record<string, string> = {}
const EMPTY_CONDUCTOR_LOCAL_OUTPUT: LocalOutput = { kind: 'conductor', value: EMPTY_CONDUCTOR_OUTPUT }

function getEmptyOutput(nodeType: AppNode['type']): LocalOutput | null {
  switch (nodeType) {
    case 'instruction':
    case 'context-converter':
    case 'llm':
      return EMPTY_STRING_OUTPUT
    case 'code-search':
      return EMPTY_CODE_SEARCH_LOCAL_OUTPUT
    case 'code-search-conductor':
      return EMPTY_CONDUCTOR_LOCAL_OUTPUT
    default:
      return null
  }
}

function getEmptyNodeOutput(nodeType: AppNode['type']): unknown {
  switch (nodeType) {
    case 'instruction':
    case 'context-converter':
    case 'llm':
      return ''
    case 'code-search':
      return EMPTY_CODE_SEARCH_OUTPUT
    case 'code-search-conductor':
      return EMPTY_CONDUCTOR_OUTPUT
    default:
      return null
  }
}

export function useNodeRunner(
  appDataRef: React.RefObject<AppData>,
  patchNodeById: (nodeId: string, patch: (n: AppNode) => AppNode) => void,
) {
  const inFlightRuns = useRef(new Map<string, Promise<LocalOutput | null>>())

  const nodeToLocalOutput = useCallback((node: AppNode): LocalOutput | null => {
    if (node.type === 'code-search') {
      return node.data.output
        ? { kind: 'code-search', value: node.data.output, repoPath: node.data.repoPath }
        : null
    }
    if (node.type === 'manual-import') {
      return node.data.output
        ? { kind: 'code-search', value: node.data.output, repoPath: node.data.repoPath }
        : null
    }
    if (node.type === 'code-search-conductor') {
      return node.data.output ? { kind: 'conductor', value: node.data.output } : null
    }
    if (node.type === 'context-converter' || node.type === 'instruction' || node.type === 'llm') {
      return node.data.output ? { kind: 'string', value: node.data.output } : null
    }
    return null
  }, [])

  const getStringOutput = useCallback(
    (nodeId: string, localOutputs?: Map<string, LocalOutput>): string => {
      const snap = getActiveTab(appDataRef.current)
      const n = snap.canvas.nodes.find((x) => x.id === nodeId)
      
      // Mute check: muted nodes always return empty
      if (n?.data.muted) return ''

      const local = localOutputs?.get(nodeId)
      if (local?.kind === 'string') return local.value

      if (!n) return ''
      if (n.type === 'context-converter' || n.type === 'instruction' || n.type === 'llm')
        return n.data.output ?? ''
      return ''
    },
    [appDataRef],
  )

  const getConductorOutput = useCallback(
    (nodeId: string, localOutputs?: Map<string, LocalOutput>): Record<string, string> | null => {
      const snap = getActiveTab(appDataRef.current)
      const n = snap.canvas.nodes.find((x) => x.id === nodeId)
      
      // Mute check: muted nodes always return empty
      if (n?.data.muted) return EMPTY_CONDUCTOR_OUTPUT

      const local = localOutputs?.get(nodeId)
      if (local?.kind === 'conductor') return local.value

      if (!n) return null
      if (n.type === 'code-search-conductor') return n.data.output
      return null
    },
    [appDataRef],
  )

  const getCodeSearchOutput = useCallback(
    (nodeId: string, localOutputs?: Map<string, LocalOutput>): CodeSearchOutput | null => {
      const snap = getActiveTab(appDataRef.current)
      const n = snap.canvas.nodes.find((x) => x.id === nodeId)
      
      // Mute check: muted nodes always return empty
      if (n?.data.muted) return EMPTY_CODE_SEARCH_OUTPUT

      const local = localOutputs?.get(nodeId)
      if (local?.kind === 'code-search') return local.value

      if (!n) return null
      if (n.type === 'code-search' || n.type === 'manual-import') return n.data.output
      return null
    },
    [appDataRef],
  )

  const getCodeSearchRepoPath = useCallback(
    (nodeId: string, localOutputs?: Map<string, LocalOutput>): string => {
      const snap = getActiveTab(appDataRef.current)
      const n = snap.canvas.nodes.find((x) => x.id === nodeId)
      
      // Mute check: muted nodes always return empty
      if (n?.data.muted) return ''

      const local = localOutputs?.get(nodeId)
      if (local?.kind === 'code-search' && typeof local.repoPath === 'string') return local.repoPath

      if (!n) return ''
      if (n.type === 'code-search' || n.type === 'manual-import') return n.data.repoPath
      return ''
    },
    [appDataRef],
  )

  const concatPredStrings = useCallback(
    (preds: AppNode[], localOutputs?: Map<string, LocalOutput>) => {
      const parts: string[] = []
      for (const p of preds) {
        if (p.type === 'context-converter') {
          const s = getStringOutput(p.id, localOutputs).trim()
          if (s) parts.push(s)
        }
      }
      for (const p of preds) {
        if (p.type === 'instruction' || p.type === 'llm') {
          const s = getStringOutput(p.id, localOutputs).trim()
          if (s) parts.push(s)
        }
      }
      return parts.join('\n\n')
    },
    [getStringOutput],
  )

  const runNode = useCallback(
    async (
      nodeId: string,
      mode: RunMode = 'single',
      localOutputs?: Map<string, LocalOutput>,
      signal?: AbortSignal,
    ): Promise<LocalOutput | null> => {
      const existing = inFlightRuns.current.get(nodeId)
      if (existing) return existing

      const promise = (async () => {
        const snapshot = getActiveTab(appDataRef.current)
        const node = snapshot.canvas.nodes.find((n) => n.id === nodeId)
        if (!node) throw new Error(`Node not found: ${nodeId}`)
        if (mode === 'single' && node.data.locked) throw new Error('Node is locked')
        throwIfAborted(signal)

        const preds = predecessors(snapshot.canvas.nodes, snapshot.canvas.edges, nodeId)
        if (mode === 'single') {
          if (!canRunFromPredecessors(preds)) {
            throw new Error('Predecessors not succeeded yet.')
          }
        }

        patchNodeById(nodeId, (n) => ({ ...n, data: { ...n.data, status: 'running', error: null } } as AppNode))

        try {
          // Mute check: if node is muted, return empty output without executing
          if (node.data.muted) {
            const emptyOutput = getEmptyNodeOutput(node.type)

            patchNodeById(nodeId, (n) => ({
              ...n,
              data: {
                ...n.data,
                output: emptyOutput,
                ...(n.type === 'context-converter' ? { mergedFiles: undefined } : {}),
                status: 'success',
                error: null,
              },
            } as AppNode))

            const out = getEmptyOutput(node.type)
            if (out) localOutputs?.set(nodeId, out)
            return out
          }

          if (node.type === 'instruction') {
            throwIfAborted(signal)

            // Get dynamic input from predecessors (like context-converter does)
            const predecessorText = concatPredStrings(preds, localOutputs).trim()

            // Get user's instruction text (this is the static user-defined content)
            const userInstruction = node.data.text.trim()

            // Validation: require either predecessors OR user instruction (or both)
            const hasPredecessors = preds.length > 0 && predecessorText.length > 0
            const hasUserInstruction = userInstruction.length > 0

            if (!hasPredecessors && !hasUserInstruction) {
              // No predecessors and no user text - prompt for input
              const prompted = window.prompt('Instruction?') || ''
              if (!prompted.trim()) {
                throw new Error('Instruction node requires either predecessor inputs or user instruction text')
              }
              // If user provides text via prompt, treat it as user instruction
              const finalText = prompted.trim()

              patchNodeById(nodeId, (n) => {
                if (n.type !== 'instruction') return n
                return {
                  ...n,
                  data: {
                    ...n.data,
                    text: finalText, // Save prompted text as user instruction
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

            // Combine predecessor text and user instruction
            // Format: predecessor context first, then user instruction
            const parts: string[] = []
            if (predecessorText) {
              parts.push(predecessorText)
            }
            if (userInstruction) {
              parts.push(userInstruction)
            }
            const finalText = parts.join('\n\n')

            patchNodeById(nodeId, (n) => {
              if (n.type !== 'instruction') return n
              return {
                ...n,
                data: {
                  ...n.data,
                  // DO NOT overwrite text - keep user's original instruction
                  output: finalText, // Store combined output
                  status: 'success',
                  error: null,
                },
              }
            })

            const out: LocalOutput = { kind: 'string', value: finalText }
            localOutputs?.set(nodeId, out)
            return out
          }

          if (node.type === 'code-search-conductor') {
            throwIfAborted(signal)

            // Get predecessor text (context from upstream nodes)
            const predecessorText = concatPredStrings(preds, localOutputs).trim()

            // Get user's query (static user-defined content)
            const userQuery = node.data.query.trim()

            // Validation: require either predecessors OR user query (or both)
            const hasPredecessors = preds.length > 0 && predecessorText.length > 0
            const hasUserQuery = userQuery.length > 0

            let finalQuery = ''

            if (!hasPredecessors && !hasUserQuery) {
              // No predecessors and no user query - prompt for input
              const prompted = window.prompt('Conductor query?') || ''
              if (!prompted.trim()) {
                throw new Error('Conductor requires either predecessor inputs or a user query')
              }
              finalQuery = prompted.trim()
            } else {
              // Combine predecessor text and user query
              // Format: predecessor context first, then user query
              const parts: string[] = []
              if (predecessorText) {
                parts.push(predecessorText)
              }
              if (userQuery) {
                parts.push(userQuery)
              }
              finalQuery = parts.join('\n\n')
            }

            const model = node.data.model.trim()
            if (!model) throw new Error('Conductor requires a model to be selected')

            const byId = new Map(snapshot.canvas.nodes.map((n) => [n.id, n] as const))
            const successorIds = snapshot.canvas.edges
              .filter((e) => e.source === nodeId)
              .map((e) => e.target)
              .filter((id) => byId.get(id)?.type === 'code-search')
              .sort()

            if (successorIds.length === 0)
              throw new Error('Conductor requires at least one code-search successor.')

            const successorTitles: Record<string, string> = {}
            for (const id of successorIds) {
              successorTitles[id] = byId.get(id)?.data.title ?? id
            }

            throwIfAborted(signal)
            const output = await runConductor({
              model,
              query: finalQuery,
              successorIds,
              successorTitles,
              signal,
            })

            patchNodeById(nodeId, (n) => {
              if (n.type !== 'code-search-conductor') return n
              return {
                ...n,
                data: {
                  ...n.data,
                  // DO NOT overwrite query - keep user's original value
                  output,
                  status: 'success',
                  error: null,
                },
              }
            })

            const out: LocalOutput = { kind: 'conductor', value: output }
            localOutputs?.set(nodeId, out)
            return out
          }

          if (node.type === 'code-search') {
            throwIfAborted(signal)
            const conductorPreds = preds.filter((p) => p.type === 'code-search-conductor')
            if (conductorPreds.length > 1)
              throw new Error('Multiple conductor predecessors are not supported.')

            let finalQuery = ''
            if (conductorPreds.length === 1) {
              // Conductor mode: use conductor-assigned query directly
              const conductorId = conductorPreds[0].id
              const map = getConductorOutput(conductorId, localOutputs)
              if (!map) throw new Error('Conductor has no output.')
              const assigned = map[nodeId]
              if (typeof assigned !== 'string' || !assigned.trim()) {
                throw new Error(`Conductor output missing query for this node: ${nodeId}`)
              }
              finalQuery = assigned.trim()
            } else {
              // Non-conductor mode: combine predecessor input with user query
              const predecessorText = concatPredStrings(preds, localOutputs).trim()
              const userQuery = node.data.query.trim()

              const hasPredecessors = preds.length > 0 && predecessorText.length > 0
              const hasUserQuery = userQuery.length > 0

              if (!hasPredecessors && !hasUserQuery) {
                // No predecessors and no user query - prompt for input
                const prompted = window.prompt('Code search query?') || ''
                if (!prompted.trim()) {
                  throw new Error('Code search node requires either predecessor inputs or user query')
                }
                finalQuery = prompted.trim()
              } else {
                // Combine predecessor text and user query
                // Format: predecessor context first, then user query
                const parts: string[] = []
                if (predecessorText) {
                  parts.push(predecessorText)
                }
                if (userQuery) {
                  parts.push(userQuery)
                }
                finalQuery = parts.join('\n\n')
              }
            }
            if (!finalQuery.trim()) throw new Error('Empty query')

            let repoPath = (node.data.repoPath || '').trim()
            if (!repoPath) {
              repoPath = window.prompt('Repo path?', 'examples/example-repo') || ''
              if (!repoPath.trim()) throw new Error('Empty repoPath')
            }
            throwIfAborted(signal)
            const result = await runCodeSearch({
              repoPath,
              query: finalQuery,
              debugMessages: !!node.data.debugMessages,
              signal,
            })
            patchNodeById(nodeId, (n) => {
              if (n.type !== 'code-search') return n
              return {
                ...n,
                data: {
                  ...n.data,
                  repoPath,
                  // DO NOT overwrite query - keep user's original query
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

          if (node.type === 'manual-import') {
            throwIfAborted(signal)
            const repoPath = (node.data.repoPath || '').trim()
            if (!repoPath) throw new Error('Empty repoPath')
            const items = Array.isArray(node.data.items) ? node.data.items : []
            if (items.length === 0) throw new Error('No items selected')

            throwIfAborted(signal)
            const result = await resolveManualImport({ repoPath, items, signal })

            patchNodeById(nodeId, (n) => {
              if (n.type !== 'manual-import') return n
              return {
                ...n,
                data: {
                  ...n.data,
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
            throwIfAborted(signal)
            const searchPreds = preds.filter((p) => p.type === 'code-search' || p.type === 'manual-import')
            if (searchPreds.length === 0)
              throw new Error('Context converter requires a code-search/manual-import predecessor.')

            const byRepo = new Map<
              string,
              { outputs: Array<{ explanation: string; files: CodeSearchOutput['files'] }>; explanations: string[] }
            >()

            for (const p of searchPreds) {
              const out = getCodeSearchOutput(p.id, localOutputs)
              if (!out) throw new Error('Code-search predecessor has no output.')
              const repoPath = getCodeSearchRepoPath(p.id, localOutputs)
              const entry = byRepo.get(repoPath) ?? { outputs: [], explanations: [] }
              entry.outputs.push({ explanation: out.explanation, files: out.files })
              if (out.explanation) entry.explanations.push(out.explanation)
              byRepo.set(repoPath, entry)
            }

            const contexts: string[] = []
            const allMergedFiles: Record<string, Array<[number, number]>> = {}

            for (const [repoPath, { outputs, explanations }] of byRepo.entries()) {
              const mergedFiles = mergeCodeSearchOutputs(outputs)
              const mergedFilesForDisplay = node.data.fullFile
                ? Object.fromEntries(Object.keys(mergedFiles).map((p) => [p, [[1, -1]] as [number, number][]]))
                : mergedFiles
              Object.assign(allMergedFiles, mergedFilesForDisplay)

              const text = await buildRepoContext({
                repoPath,
                explanation: explanations
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .join('\n\n---\n\n'),
                files: mergedFiles,
                fullFile: node.data.fullFile,
                signal,
              })
              contexts.push(text)
            }

            const text = contexts.join('\n\n---\n\n').trimEnd() + '\n\n---end of code context---\n\n'
            patchNodeById(nodeId, (n) => {
              if (n.type !== 'context-converter') return n
              return {
                ...n,
                data: {
                  ...n.data,
                  output: text,
                  mergedFiles: allMergedFiles,
                  status: 'success',
                  error: null,
                },
              }
            })
            const out: LocalOutput = { kind: 'string', value: text }
            localOutputs?.set(nodeId, out)
            return out
          }

          // LLM node
          throwIfAborted(signal)

          // Get predecessor text (context from upstream nodes)
          const predecessorText = concatPredStrings(preds, localOutputs).trim()

          // Get user's query (static user-defined content)
          const userQuery = node.data.query.trim()

          // System prompt is OPTIONAL - empty string is valid
          const systemPrompt = node.data.systemPrompt.trim()

          // Validation: require either predecessors OR user query (or both)
          // System prompt is NOT required
          const hasPredecessors = preds.length > 0 && predecessorText.length > 0
          const hasUserQuery = userQuery.length > 0

          if (!hasPredecessors && !hasUserQuery) {
            // No predecessors and no user query - prompt for input
            const prompted = window.prompt('LLM query?') || ''
            if (!prompted.trim()) {
              throw new Error('LLM node requires either predecessor inputs or a user query')
            }
            // Use prompted text as the query
            const finalQuery = prompted.trim()

            const model = node.data.model.trim()
            if (!model) throw new Error('LLM node requires a model to be selected')

            throwIfAborted(signal)
            const output = await runLLM({
              model,
              systemPrompt, // Can be empty
              query: finalQuery,
              context: '', // No predecessor context in this case
              signal,
            })

            patchNodeById(nodeId, (n) => {
              if (n.type !== 'llm') return n
              return {
                ...n,
                data: {
                  ...n.data,
                  // DO NOT overwrite query - keep user's original (empty in this case)
                  output,
                  status: 'success',
                  error: null,
                },
              }
            })

            const out: LocalOutput = { kind: 'string', value: output }
            localOutputs?.set(nodeId, out)
            return out
          }

          // Normal case: has predecessors and/or user query
          const model = node.data.model.trim()
          if (!model) throw new Error('LLM node requires a model to be selected')

          // Combine predecessor text and user query
          // Format: predecessor context first, then user query
          // This matches the pattern used by instruction and code-search nodes
          const queryParts: string[] = []
          if (predecessorText) {
            queryParts.push(predecessorText)
          }
          if (userQuery) {
            queryParts.push(userQuery)
          }
          const finalQuery = queryParts.join('\n\n')

          throwIfAborted(signal)
          const output = await runLLM({
            model,
            systemPrompt, // Can be empty - that's valid
            query: finalQuery,
            context: '', // Context is now incorporated into finalQuery
            signal,
          })

          patchNodeById(nodeId, (n) => {
            if (n.type !== 'llm') return n
            return {
              ...n,
              data: {
                ...n.data,
                // DO NOT overwrite query or systemPrompt - keep user's original values
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
          if (mode === 'chain' && (signal?.aborted || isAbortError(err) || err instanceof ChainCancelledError)) {
            patchNodeById(nodeId, (n) => ({ ...n, data: { ...n.data, status: 'idle', error: null } } as AppNode))
            throw new ChainCancelledError()
          }
          const message = err instanceof Error ? err.message : String(err)
          patchNodeById(nodeId, (n) => ({ ...n, data: { ...n.data, status: 'error', error: message } } as AppNode))
          throw err
        }
      })().finally(() => {
        inFlightRuns.current.delete(nodeId)
      })

      inFlightRuns.current.set(nodeId, promise)
      return promise
    },
    [appDataRef, patchNodeById, concatPredStrings, getConductorOutput, getCodeSearchOutput, getCodeSearchRepoPath],
  )

  return {
    inFlightRuns,
    runNode,
    nodeToLocalOutput,
  }
}
