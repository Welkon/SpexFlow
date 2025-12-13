import type { Edge, Node } from '@xyflow/react'

export type NodeStatus = 'idle' | 'running' | 'success' | 'error'

export type BaseNodeData = {
  title: string
  status: NodeStatus
  error: string | null
  locked: boolean
}

export type CodeSearchOutput = {
  explanation: string
  files: Record<string, [number, number][]>
}

export type CodeSearchData = BaseNodeData & {
  repoPath: string
  query: string
  debugMessages: boolean
  output: CodeSearchOutput | null
}

export type ContextConverterData = BaseNodeData & {
  fullFile: boolean
  output: string | null
}

export type InstructionData = BaseNodeData & {
  text: string
  output: string | null
}

export type LLMData = BaseNodeData & {
  model: string
  systemPrompt: string
  query: string
  output: string | null
}

export type CodeSearchNode = Node<CodeSearchData, 'code-search'>
export type ContextConverterNode = Node<ContextConverterData, 'context-converter'>
export type InstructionNode = Node<InstructionData, 'instruction'>
export type LLMNode = Node<LLMData, 'llm'>

export type AppNode = CodeSearchNode | ContextConverterNode | InstructionNode | LLMNode

export type Canvas = {
  nodes: AppNode[]
  edges: Edge[]
}

export type Tab = {
  id: string
  name: string
  createdAt: string
  canvas: Canvas
}

export type AppData = {
  version: number
  tabs: Tab[]
  activeTabId: string | null
}
