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
  ContextConverterData,
  InstructionData,
  LLMData,
  ManualImportData,
  ManualImportItem,
  LLMModel,
  LLMProvider,
  CodeSearchProvider,
  NodeStatus,
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
  ContextConverterData,
  InstructionData,
  LLMData,
  ManualImportData,
  ManualImportItem,
  LLMModel,
  LLMProvider,
  CodeSearchProvider,
  NodeStatus,
  Viewport,
}

export type CodeSearchNode = Node<CodeSearchData, 'code-search'>
export type ContextConverterNode = Node<ContextConverterData, 'context-converter'>
export type InstructionNode = Node<InstructionData, 'instruction'>
export type CodeSearchConductorNode = Node<CodeSearchConductorData, 'code-search-conductor'>
export type LLMNode = Node<LLMData, 'llm'>
export type ManualImportNode = Node<ManualImportData, 'manual-import'>

export type AppNode =
  | CodeSearchNode
  | ContextConverterNode
  | InstructionNode
  | CodeSearchConductorNode
  | LLMNode
  | ManualImportNode

export type Canvas = CanvasBase<AppNode, Edge>
export type Tab = TabBase<AppNode, Edge>
export type AppData = AppDataBase<AppNode, Edge>

export type ChainRunStatus = 'running' | 'completed' | 'cancelled' | 'error'

export type ChainRun = {
  id: string
  startedAt: string
  fromNodeId: string
  fromNodeTitle: string
  nodeIds: string[]
  completedNodeIds: string[]
  failedNodeIds: string[]
  status: ChainRunStatus
  abortController: AbortController
}
