import type { Edge, Node } from '@xyflow/react'
import type {
  APISettings,
  AppData as AppDataBase,
  BaseNodeData,
  Canvas as CanvasBase,
  CodeSearchConductorData,
  CodeSearchData,
  CodeSearchOutput,
  ConductorOutput,
  ContextSource,
  ContextConverterData,
  InstructionData,
  LLMData,
  ManualImportData,
  ManualImportItem,
  LLMModel,
  LLMProvider,
  CodeSearchProvider,
  NodeStatus,
  Spec,
  SpecOutputMapping,
  SpecRunResult,
  SpecStatus,
  Tab as TabBase,
  Viewport,
} from '../../shared/appDataTypes'

export type {
  APISettings,
  AppDataBase,
  BaseNodeData,
  CodeSearchConductorData,
  CodeSearchData,
  CodeSearchOutput,
  ConductorOutput,
  ContextSource,
  ContextConverterData,
  InstructionData,
  LLMData,
  ManualImportData,
  ManualImportItem,
  LLMModel,
  LLMProvider,
  CodeSearchProvider,
  NodeStatus,
  Spec,
  SpecOutputMapping,
  SpecRunResult,
  SpecStatus,
  Viewport,
}

export type CodeSearchNode = Node<CodeSearchData, 'code-search'>
export type ContextConverterNode = Node<ContextConverterData, 'context-converter'>
export type InstructionNode = Node<InstructionData, 'instruction'>
export type CodeSearchConductorNode = Node<CodeSearchConductorData, 'code-search-conductor'>
export type LLMNode = Node<LLMData, 'llm'>
export type ManualImportNode = Node<ManualImportData, 'manual-import'>

export type NonArchiveNode =
  | CodeSearchNode
  | ContextConverterNode
  | InstructionNode
  | CodeSearchConductorNode
  | LLMNode
  | ManualImportNode

export type ArchivedMember = {
  id: string // Original node id
  type: NonArchiveNode['type'] // Original node type (excluding 'archive')
  title: string
  customName?: string
  status: NodeStatus
  archivedAt: string // ISO timestamp
  // Store a snapshot of key data for inspection
  snapshot: Record<string, unknown>
}

export type ArchiveData = {
  title: string
  status: NodeStatus
  error: string | null
  locked: boolean
  muted: boolean
  customName?: string
  customColor?: string
  width?: number
  height?: number
  // Store archived nodes flattened - this ensures associativity
  members: ArchivedMember[]
  output: string | null
}

export type ArchiveNode = Node<ArchiveData, 'archive'>

export type AppNode = NonArchiveNode | ArchiveNode

export type Canvas = CanvasBase<AppNode, Edge>
export type Tab = TabBase<AppNode, Edge> & {
  specs?: Spec[]
}
export type AppData = Omit<AppDataBase<AppNode, Edge>, 'tabs'> & { tabs: Tab[] }

export type ChainRunStatus = 'running' | 'completed' | 'cancelled' | 'error'

export type ChainRun = {
  id: string
  tabId: string
  startedAt: string
  fromNodeId: string
  fromNodeTitle: string
  nodeIds: string[]
  completedNodeIds: string[]
  failedNodeIds: string[]
  status: ChainRunStatus
  abortController: AbortController
}
