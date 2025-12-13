import { useCallback } from 'react'
import type { AppNode } from '../types'
import { resetNodeRuntime } from '../utils'
import { ExpandableTextarea } from './ExpandableTextarea'
import { InlineCheckbox } from './InlineCheckbox'
import { CopyButton } from './CopyButton'

type Props = {
  selectedNode: AppNode | null
  multiSelectCount: number
  patchSelectedNode: (patch: (n: AppNode) => AppNode) => void
  deleteSelectedNodes: () => void
  runNode: (nodeId: string) => void
  runFrom: (nodeId: string) => void
}

export function NodeSidebar({
  selectedNode,
  multiSelectCount,
  patchSelectedNode,
  deleteSelectedNodes,
  runNode,
  runFrom,
}: Props) {
  // Multi-select: don't show sidebar (use MultiSelectInfo instead)
  if (multiSelectCount > 1) return null
  if (!selectedNode) return null

  const isLocked = !!selectedNode.data.locked

  const getOutputText = useCallback(() => {
    if (selectedNode.type === 'code-search' || selectedNode.type === 'code-search-conductor') {
      return selectedNode.data.output ? JSON.stringify(selectedNode.data.output, null, 2) : ''
    }
    return selectedNode.data.output ?? ''
  }, [selectedNode])

  return (
    <div className="sfSidebar">
      <div className="sfSidebarContent">
        {/* Header */}
        <div className="sfHeader">{selectedNode.data.title}</div>

        {/* Lock toggle - inline */}
        <InlineCheckbox
          label="Locked"
          checked={isLocked}
          onChange={(checked) =>
            patchSelectedNode((n) => ({ ...n, data: { ...n.data, locked: checked } }) as AppNode)
          }
        />

        <div className="sfSectionDivider" />

        {/* Settings Section */}
        <div className="sfSectionTitle">Settings</div>

        {/* Code Search Node */}
        {selectedNode.type === 'code-search' && (
          <>
            <div className="sfFieldGroup">
              <label className="sfFieldLabel">Repository Path</label>
              <input
                className="sfInput"
                value={selectedNode.data.repoPath ?? ''}
                disabled={isLocked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'code-search' ? { ...n, data: { ...n.data, repoPath: e.target.value } } : n,
                  )
                }
                placeholder="e.g., examples/example-repo"
              />
            </div>

            <ExpandableTextarea
              label="Query"
              value={selectedNode.data.query ?? ''}
              onChange={(value) =>
                patchSelectedNode((n) =>
                  n.type === 'code-search' ? { ...n, data: { ...n.data, query: value } } : n,
                )
              }
              disabled={isLocked}
              rows={5}
              placeholder="Enter your search query..."
            />

            <InlineCheckbox
              label="Debug Messages"
              checked={!!selectedNode.data.debugMessages}
              onChange={(checked) =>
                patchSelectedNode((n) =>
                  n.type === 'code-search' ? { ...n, data: { ...n.data, debugMessages: checked } } : n,
                )
              }
              disabled={isLocked}
            />
          </>
        )}

        {/* Code Search Conductor Node */}
        {selectedNode.type === 'code-search-conductor' && (
          <div className="sfFieldGroup">
            <label className="sfFieldLabel">Model</label>
            <input
              className="sfInput"
              value={selectedNode.data.model ?? ''}
              disabled={isLocked}
              onChange={(e) =>
                patchSelectedNode((n) =>
                  n.type === 'code-search-conductor' ? { ...n, data: { ...n.data, model: e.target.value } } : n,
                )
              }
              placeholder="e.g., gpt-4"
            />
          </div>
        )}

        {/* Context Converter Node */}
        {selectedNode.type === 'context-converter' && (
          <InlineCheckbox
            label="Full File Mode"
            checked={!!selectedNode.data.fullFile}
            onChange={(checked) =>
              patchSelectedNode((n) =>
                n.type === 'context-converter' ? { ...n, data: { ...n.data, fullFile: checked } } : n,
              )
            }
            disabled={isLocked}
          />
        )}

        {/* Instruction Node */}
        {selectedNode.type === 'instruction' && (
          <ExpandableTextarea
            label="Instruction Text"
            value={selectedNode.data.text ?? ''}
            onChange={(value) =>
              patchSelectedNode((n) =>
                n.type === 'instruction' ? { ...n, data: { ...n.data, text: value } } : n,
              )
            }
            disabled={isLocked}
            rows={8}
            placeholder="Enter instruction text (or leave empty to use predecessor input)..."
          />
        )}

        {/* LLM Node */}
        {selectedNode.type === 'llm' && (
          <>
            <div className="sfFieldGroup">
              <label className="sfFieldLabel">Model</label>
              <input
                className="sfInput"
                value={selectedNode.data.model ?? ''}
                disabled={isLocked}
                onChange={(e) =>
                  patchSelectedNode((n) =>
                    n.type === 'llm' ? { ...n, data: { ...n.data, model: e.target.value } } : n,
                  )
                }
                placeholder="e.g., gpt-4"
              />
            </div>

            <ExpandableTextarea
              label="System Prompt"
              value={selectedNode.data.systemPrompt ?? ''}
              onChange={(value) =>
                patchSelectedNode((n) =>
                  n.type === 'llm' ? { ...n, data: { ...n.data, systemPrompt: value } } : n,
                )
              }
              disabled={isLocked}
              rows={4}
              placeholder="Enter system prompt..."
            />

            <ExpandableTextarea
              label="Query"
              value={selectedNode.data.query ?? ''}
              onChange={(value) =>
                patchSelectedNode((n) =>
                  n.type === 'llm' ? { ...n, data: { ...n.data, query: value } } : n,
                )
              }
              disabled={isLocked}
              rows={4}
              placeholder="Enter query (or leave empty to use predecessor input)..."
            />
          </>
        )}

        <div className="sfSectionDivider" />

        {/* Actions Section */}
        <div className="sfSectionTitle">Actions</div>
        <div className="sfButtonGroup">
          <button onClick={() => runNode(selectedNode.id)} disabled={isLocked}>
            Run
          </button>
          <button onClick={() => runFrom(selectedNode.id)} disabled={isLocked}>
            Chain
          </button>
          <button
            onClick={() => patchSelectedNode(resetNodeRuntime)}
            disabled={isLocked || selectedNode.data.status === 'running'}
          >
            Reset
          </button>
          <button onClick={deleteSelectedNodes}>Delete</button>
        </div>

        {/* Output Section */}
        {selectedNode.data.output !== null && selectedNode.data.output !== undefined && (
          <div className="sfOutputSection">
            <div className="sfOutputHeader">
              <span className="sfOutputTitle">Output</span>
              <CopyButton getText={getOutputText} />
            </div>
            <div className="sfOutputPreview">
              {typeof selectedNode.data.output === 'string'
                ? selectedNode.data.output.slice(0, 500) + (selectedNode.data.output.length > 500 ? '...' : '')
                : JSON.stringify(selectedNode.data.output, null, 2).slice(0, 500)}
            </div>
          </div>
        )}

        {/* Error Display */}
        {selectedNode.data.error && (
          <div className="sfErrorSection">
            <div className="sfErrorTitle">Error</div>
            <div className="sfErrorMessage">{selectedNode.data.error}</div>
          </div>
        )}
      </div>
    </div>
  )
}
