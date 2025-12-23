import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useAppData, useNodeRunner, useChainRunner, useClipboard, useHotkeys } from './hooks'
import { NodeSidebar, ToolbarButton, MultiSelectInfo, APISettingsModal, SettingsIcon, DropdownMenu, CanvasFilePicker, CanvasSettingsModal, CanvasIcon } from './components'
import type { APISettings, AppData, Viewport } from './types'
import type { Dispatch, RefObject, SetStateAction, MouseEvent as ReactMouseEvent } from 'react'
import {
  HandIcon,
  SelectIcon,
  SearchIcon,
  ImportIcon,
  ConductorIcon,
  DocumentIcon,
  InstructionIcon,
  LLMIcon,
  ResetIcon,
} from './components/Icons'
import { ChainManager } from './ChainManager'
import { canRunFromPredecessors, predecessors, sameIdSet } from './utils'
import { t } from './i18n'
import {
  CodeSearchConductorNodeView,
  CodeSearchNodeView,
  ContextConverterNodeView,
  InstructionNodeView,
  LLMNodeView,
  ManualImportNodeView,
  ArchiveNodeView,
} from './nodes'

type ExpandedNodeField = {
  nodeId: string
  field: 'query' | 'text' | 'files'
  token: number
}

export function SpecFlowApp() {
  const app = useAppData()
  if (app.isLoading) return <div className="sfLoading">Loading...</div>
  if (app.loadError || !app.appData || !app.activeTab) {
    const msg = app.loadError ?? 'Invalid app data'
    return (
      <div className="sfLoading">
        <div className="sfError">Failed to load: {msg}</div>
      </div>
    )
  }

  return <SpecFlowAppLoaded {...app} appData={app.appData} activeTab={app.activeTab} />
}

function SpecFlowAppLoaded(props: ReturnType<typeof useAppData> & { appData: AppData; activeTab: NonNullable<ReturnType<typeof useAppData>['activeTab']> }) {
  const {
    appData,
    setAppData,
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
    archiveSelectedNodes,
    unarchiveNode,
    updateCanvasById,
    updateActiveViewport,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    patchSelectedNode,
    patchNodeByIdInTab,
    loadCanvas,
    renameCanvas,
    deleteCanvas,
    duplicateCanvas,
    updateCanvasSettings,
  } = props

  const appDataRef = props.appDataRef as RefObject<AppData>
  const setAppDataStrict: Dispatch<SetStateAction<AppData>> = useCallback(
    (next) => {
      setAppData((prev) => {
        if (!prev) throw new Error('App data not loaded')
        return typeof next === 'function' ? (next as (p: AppData) => AppData)(prev) : next
      })
    },
    [setAppData],
  )

  const { inFlightRuns, runNode, nodeToLocalOutput } = useNodeRunner(appDataRef, patchNodeByIdInTab)

  const { chainRuns, cancelChain, runFrom, resetActiveCanvasAll } = useChainRunner(
    appDataRef,
    updateCanvasById,
    inFlightRuns,
    runNode,
    nodeToLocalOutput,
  )

  const { copySelectedNodes, pasteClipboard } = useClipboard(
    appDataRef,
    selectedRef,
    setAppDataStrict,
    setSelected,
  )

  const { interactionMode, setInteractionMode, spaceHeld } = useHotkeys(copySelectedNodes, pasteClipboard)

  const [isDragSelecting, setIsDragSelecting] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLoadPickerOpen, setIsLoadPickerOpen] = useState(false)
  const [isCanvasSettingsOpen, setIsCanvasSettingsOpen] = useState(false)
  const [canvasSettingsTabId, setCanvasSettingsTabId] = useState<string | null>(null)
  const [expandedNodeField, setExpandedNodeField] = useState<ExpandedNodeField | null>(null)
  const expandedFieldTokenRef = useRef(0)

  const language = appData.ui.language

  const canvasSettingsTab = useMemo(() => {
    if (!canvasSettingsTabId) return activeTab
    return appData.tabs.find((t) => t.id === canvasSettingsTabId) ?? activeTab
  }, [activeTab, appData.tabs, canvasSettingsTabId])

  const mutedNodeIds = useMemo(() => {
    return new Set(activeTab.canvas.nodes.filter((n) => n.data.muted).map((n) => n.id))
  }, [activeTab.canvas.nodes])

  const rfEdges = useMemo(() => {
    const selectedNodeIds = selected?.nodeIds?.length ? new Set(selected.nodeIds) : null
    const hasSelectionFocus = !!selectedNodeIds
    return activeTab.canvas.edges.map((edge) => {
      const isEdgeSelected = !!edge.selected
      const isConnectedToMuted = mutedNodeIds.has(edge.source) || mutedNodeIds.has(edge.target)
      const isConnectedToSelected = selectedNodeIds
        ? selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)
        : false
      const isInFocus = isEdgeSelected || isConnectedToSelected

      const baseOpacity = typeof edge.style?.opacity === 'number' ? edge.style.opacity : 1
      // @@@edge focus - selection dims others; muted still stacks via multiplication
      const selectionFactor = hasSelectionFocus ? (isInFocus ? 1 : 0.25) : 1
      const muteFactor = isConnectedToMuted ? 0.4 : 1
      const nextOpacity = baseOpacity * selectionFactor * muteFactor

      const shouldBold = isEdgeSelected || (hasSelectionFocus && isConnectedToSelected)
      const baseStrokeWidth =
        typeof edge.style?.strokeWidth === 'number' ? edge.style.strokeWidth : undefined
      const nextStrokeWidth = shouldBold
        ? Math.max(baseStrokeWidth ?? 0, 3.5)
        : baseStrokeWidth

      const needsOpacityChange = Math.abs(nextOpacity - baseOpacity) > 0.0001
      const needsBoldChange = shouldBold && nextStrokeWidth !== edge.style?.strokeWidth
      if (!needsOpacityChange && !needsBoldChange) return edge

      return {
        ...edge,
        ...(shouldBold ? { zIndex: Math.max(edge.zIndex ?? 0, 2) } : {}),
        style: {
          ...edge.style,
          opacity: nextOpacity,
          ...(shouldBold ? { strokeWidth: nextStrokeWidth } : {}),
        },
      }
    })
  }, [activeTab.canvas.edges, mutedNodeIds, selected])

  // Live viewport ref for immediate access (not debounced)
  const liveViewportRef = useRef<Viewport>(activeTab.canvas.viewport ?? { x: 0, y: 0, zoom: 1 })

  // Debounced viewport save handler
  const viewportTimerRef = useRef<number | null>(null)

  const handleViewportChange = useCallback((viewport: Viewport) => {
    // Update live ref immediately
    liveViewportRef.current = viewport
    // Debounce the save
    if (viewportTimerRef.current) {
      window.clearTimeout(viewportTimerRef.current)
    }
    viewportTimerRef.current = window.setTimeout(() => {
      updateActiveViewport(viewport)
    }, 300)  // Debounce 300ms to avoid too frequent saves
  }, [updateActiveViewport])

  // Sync liveViewportRef when switching tabs
  useEffect(() => {
    liveViewportRef.current = activeTab.canvas.viewport ?? { x: 0, y: 0, zoom: 1 }
  }, [activeTab.id])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewportTimerRef.current) {
        window.clearTimeout(viewportTimerRef.current)
      }
    }
  }, [])

  const updateAPISettings = useCallback((newSettings: APISettings) => {
    setAppDataStrict(prev => ({
      ...prev,
      apiSettings: newSettings
    }))
  }, [setAppDataStrict])

  const updateLanguage = useCallback((next: typeof language) => {
    setAppDataStrict((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        language: next,
      },
    }))
  }, [setAppDataStrict])

  const nodeTypes = useMemo(
    () => ({
      'code-search': CodeSearchNodeView,
      'code-search-conductor': CodeSearchConductorNodeView,
      'context-converter': ContextConverterNodeView,
      instruction: InstructionNodeView,
      llm: LLMNodeView,
      'manual-import': ManualImportNodeView,
      archive: ArchiveNodeView,
    }),
    [],
  )

  const primarySelectedNode =
    selected && selected.nodeIds.length > 0
      ? activeTab.canvas.nodes.find((n) => n.id === selected.primaryId) ?? null
      : null

  const selectedNode = selected && selected.nodeIds.length === 1 ? primarySelectedNode : null

  const canRunFromPreds = useMemo(() => {
    if (!selectedNode) return true
    const preds = predecessors(activeTab.canvas.nodes, activeTab.canvas.edges, selectedNode.id)
    return canRunFromPredecessors(preds)
  }, [activeTab.canvas.edges, activeTab.canvas.nodes, selectedNode?.id])

  const tabStatuses = useMemo(() => {
    const statuses = new Map<string, 'idle' | 'running' | 'error'>()
    for (const tab of appData.tabs) {
      const tabChains = chainRuns.filter((r) => r.tabId === tab.id)
      const hasRunning = tabChains.some((r) => r.status === 'running')
      const hasError = tabChains.some((r) => r.status === 'error')
      if (hasRunning) {
        statuses.set(tab.id, 'running')
      } else if (hasError) {
        statuses.set(tab.id, 'error')
      } else {
        statuses.set(tab.id, 'idle')
      }
    }
    return statuses
  }, [appData.tabs, chainRuns])

  const tabNameById = useMemo(() => {
    return new Map(appData.tabs.map((tab) => [tab.id, tab.name]))
  }, [appData.tabs])

  const handleQuickLayout = useCallback(
    (layoutType: 'vertical-stack' | 'compact-stack' | 'horizontal-stack') => {
      if (!selected || selected.nodeIds.length < 2) return
      if (layoutType !== 'vertical-stack' && layoutType !== 'compact-stack') {
        throw new Error(`Unsupported layoutType: ${layoutType}`)
      }

      const selectedSet = new Set(selected.nodeIds)
      const selectedNodes = activeTab.canvas.nodes.filter((n) => selectedSet.has(n.id))
      if (selectedNodes.some((n) => n.data.locked)) {
        alert('Quick Layout: selection contains locked node(s)')
        return
      }

      const sorted = [...selectedNodes].sort((a, b) => (a.position.y ?? 0) - (b.position.y ?? 0))
      const startX = Math.min(...sorted.map((n) => n.position.x ?? 0))
      const startY = Math.min(...sorted.map((n) => n.position.y ?? 0))

      const GAP = layoutType === 'compact-stack' ? -32 : 0
      const DEFAULT_HEIGHT = 80

      let y = startY
      const changes = sorted.map((n) => {
        const h = n.data.height ?? n.height ?? n.measured?.height ?? DEFAULT_HEIGHT
        const next = { type: 'position' as const, id: n.id, position: { x: startX, y }, dragging: false }
        y += h + GAP
        return next
      })

      onNodesChange(changes)
    },
    [activeTab.canvas.nodes, onNodesChange, selected],
  )

  const handleNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: { id: string; type?: string }) => {
      void _event
      let field: ExpandedNodeField['field'] | null = null
      switch (node.type) {
        case 'code-search':
        case 'code-search-conductor':
        case 'llm':
          field = 'query'
          break
        case 'instruction':
          field = 'text'
          break
        case 'manual-import':
          field = 'files'
          break
        default:
          return
      }
      expandedFieldTokenRef.current += 1
      setExpandedNodeField({ nodeId: node.id, field, token: expandedFieldTokenRef.current })
    },
    [setExpandedNodeField],
  )

  const handleExpandedFieldHandled = useCallback((token: number) => {
    setExpandedNodeField((prev) => {
      if (!prev || prev.token !== token) return prev
      return null
    })
  }, [])

  return (
    <div className="sfRoot">
      <ChainManager runs={chainRuns} onCancel={cancelChain} tabNameById={tabNameById} />

      {/* Tab bar */}
      <div className="sfTabs">
        {appData.tabs.map((t) => {
          const status = tabStatuses.get(t.id) ?? 'idle'
          const tabClass = [
            'sfTab',
            t.id === appData.activeTabId ? 'sfTabActive' : null,
            status !== 'idle' ? `sfTab--${status}` : null,
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div
              key={t.id}
              className={tabClass}
              onClick={() => setActiveTabId(t.id)}
            >
              {status === 'running' && <span className="sfTabSpinner" />}
              {status === 'error' && <span className="sfTabError">!</span>}
            <span
              className="sfTabName"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setActiveTabId(t.id)
                setCanvasSettingsTabId(t.id)
                setIsCanvasSettingsOpen(true)
              }}
              title={t.name}
            >
              {t.name}
            </span>
            {appData.tabs.length > 1 && (
              <button
                className="sfTabClose"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.id)
                }}
                title="Close tab"
              >
                ×
              </button>
            )}
            </div>
          )
        })}

        <DropdownMenu
          trigger={<button className="sfTabAdd" title={t(language, 'new_empty_canvas')}>+</button>}
          items={[
            { label: t(language, 'new_empty_canvas'), onClick: addTab },
            { label: t(language, 'load_from_file'), onClick: () => setIsLoadPickerOpen(true) },
          ]}
        />

        <div className="sfTabActions">
          <button
            className="sfSettingsBtn"
            onClick={() => {
              setCanvasSettingsTabId(activeTab.id)
              setIsCanvasSettingsOpen(true)
            }}
            title={t(language, 'canvas_settings')}
          >
            <CanvasIcon />
          </button>
          <button
            className="sfSettingsBtn"
            onClick={() => setIsSettingsOpen(true)}
            title={t(language, 'settings')}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      {/* Main body */}
      <div className="sfBody">
        <div
          className={`sfCanvas ${interactionMode === 'hand' || spaceHeld ? 'sfCanvas--hand' : 'sfCanvas--select'}`}
        >
          {loadError ? <div className="sfLoadErrorBanner">{loadError}</div> : null}

          {/* Toolbar */}
          <div className="sfToolbar">
            <ToolbarButton
              icon={<HandIcon />}
              label={t(language, 'toolbar_hand')}
              description={t(language, 'toolbar_hand_desc')}
              shortcut="H"
              isActive={interactionMode === 'hand' && !spaceHeld}
              onClick={() => setInteractionMode('hand')}
            />
            <ToolbarButton
              icon={<SelectIcon />}
              label={t(language, 'toolbar_select')}
              description={t(language, 'toolbar_select_desc')}
              shortcut="V"
              isActive={interactionMode === 'select' && !spaceHeld}
              onClick={() => setInteractionMode('select')}
            />

            <div className="sfToolbarSeparator" />

            <ToolbarButton
              icon={<SearchIcon />}
              label={t(language, 'toolbar_code_search')}
              description={t(language, 'toolbar_code_search_desc')}
              onClick={() => addNode('code-search', liveViewportRef.current)}
            />
            <ToolbarButton
              icon={<ImportIcon />}
              label={t(language, 'toolbar_manual_import')}
              description={t(language, 'toolbar_manual_import_desc')}
              onClick={() => addNode('manual-import', liveViewportRef.current)}
            />
            <ToolbarButton
              icon={<ConductorIcon />}
              label={t(language, 'toolbar_search_conductor')}
              description={t(language, 'toolbar_search_conductor_desc')}
              onClick={() => addNode('code-search-conductor', liveViewportRef.current)}
            />
            <ToolbarButton
              icon={<DocumentIcon />}
              label={t(language, 'toolbar_context')}
              description={t(language, 'toolbar_context_desc')}
              onClick={() => addNode('context-converter', liveViewportRef.current)}
            />
            <ToolbarButton
              icon={<InstructionIcon />}
              label={t(language, 'toolbar_instruction')}
              description={t(language, 'toolbar_instruction_desc')}
              onClick={() => addNode('instruction', liveViewportRef.current)}
            />
            <ToolbarButton
              icon={<LLMIcon />}
              label={t(language, 'toolbar_llm')}
              description={t(language, 'toolbar_llm_desc')}
              onClick={() => addNode('llm', liveViewportRef.current)}
            />

            <div className="sfToolbarSpacer" />

            <ToolbarButton
              icon={<ResetIcon />}
              label={t(language, 'toolbar_reset')}
              description={t(language, 'toolbar_reset_desc')}
              onClick={resetActiveCanvasAll}
            />
          </div>

          {/* React Flow canvas */}
          <ReactFlow
            key={activeTab.id}
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={handleNodeDoubleClick}
            nodeTypes={nodeTypes}
            panOnDrag={interactionMode === 'hand' || spaceHeld}
            selectionOnDrag={interactionMode === 'select' && !spaceHeld}
            multiSelectionKeyCode="Shift"
            onSelectionStart={() => setIsDragSelecting(true)}
            onSelectionEnd={() => setIsDragSelecting(false)}
            onSelectionChange={(params) => {
              const ids = params.nodes.map((n) => n.id)
              setSelected((prev) => {
                if (ids.length === 0) return null
                const primaryCandidate = ids[ids.length - 1]
                const primaryId = prev && ids.includes(prev.primaryId) ? prev.primaryId : primaryCandidate
                if (prev && prev.primaryId === primaryId && sameIdSet(prev.nodeIds, ids)) return prev
                return { nodeIds: ids, primaryId }
              })
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultViewport={activeTab.canvas.viewport}
            onViewportChange={handleViewportChange}
            minZoom={0.1}
          >
            <Background />
            <MiniMap
              className="sfMiniMap"
              pannable
              zoomable
              nodeStrokeWidth={3}
              position="bottom-left"
            />
          </ReactFlow>
        </div>

        {/* Multi-select info box */}
        {!isDragSelecting && selected && selected.nodeIds.length > 1 && (
          <MultiSelectInfo
            count={selected.nodeIds.length}
            primaryTitle={primarySelectedNode?.data.title}
            onCopy={copySelectedNodes}
            onArchive={archiveSelectedNodes}
            onDelete={deleteSelectedNodes}
            onLayout={handleQuickLayout}
          />
        )}

        {/* Sidebar */}
        {!isDragSelecting && (
          <NodeSidebar
            selectedNode={selectedNode}
            multiSelectCount={selected?.nodeIds.length ?? 0}
            patchSelectedNode={patchSelectedNode}
            deleteSelectedNodes={deleteSelectedNodes}
            runNode={(nodeId) => runNode(activeTab.id, nodeId).catch(() => {})}
            runFrom={(nodeId) => runFrom(nodeId).catch(() => {})}
            unarchiveNode={unarchiveNode}
            apiSettings={appData.apiSettings}
            language={language}
            canRunFromPreds={canRunFromPreds}
            expandedField={expandedNodeField}
            onExpandedFieldHandled={handleExpandedFieldHandled}
          />
        )}
      </div>

      {/* API Settings Modal */}
      <APISettingsModal
        isOpen={isSettingsOpen}
        settings={appData.apiSettings}
        language={language}
        onLanguageChange={updateLanguage}
        onSave={updateAPISettings}
        onClose={() => setIsSettingsOpen(false)}
      />

      <CanvasFilePicker
        isOpen={isLoadPickerOpen}
        mode="load"
        language={language}
        onClose={() => setIsLoadPickerOpen(false)}
        onConfirmLoad={(p) => {
          setIsLoadPickerOpen(false)
          loadCanvas(p).catch((e) => alert(String((e as Error)?.message ?? e)))
        }}
      />

      <CanvasSettingsModal
        isOpen={isCanvasSettingsOpen}
        tab={canvasSettingsTab}
        language={language}
        onClose={() => setIsCanvasSettingsOpen(false)}
        onRename={renameCanvas}
        onDuplicate={duplicateCanvas}
        onDelete={deleteCanvas}
        onUpdateSettings={updateCanvasSettings}
      />
    </div>
  )
}
