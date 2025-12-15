export type NodeStatus = 'idle' | 'running' | 'success' | 'error'

export type Language = 'en' | 'zh'

export type UISettings = {
  language: Language
}

export type BaseNodeData = {
  title: string
  status: NodeStatus
  error: string | null
  locked: boolean
  muted: boolean
  customName?: string
  customColor?: string
}

export type CodeSearchOutput = {
  explanation: string
  files: Record<string, [number, number][]>
}

export type ManualImportItem = {
  kind: 'file' | 'dir'
  relPath: string
}

export type ManualImportData = BaseNodeData & {
  repoPath: string
  items: ManualImportItem[]
  output: CodeSearchOutput | null
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
  mergedFiles?: Record<string, [number, number][]>
}

export type InstructionData = BaseNodeData & {
  text: string
  output: string | null
}

export type ConductorOutput = Record<string, string>

export type CodeSearchConductorData = BaseNodeData & {
  model: string
  query: string
  output: ConductorOutput | null
}

export type LLMData = BaseNodeData & {
  model: string
  systemPrompt: string
  query: string
  output: string | null
}

// ===== API Settings Types =====

export type LLMModel = {
  id: string
  name: string
}

export type LLMProvider = {
  id: string
  name: string
  endpoint: string
  apiKey: string
  models: LLMModel[]
}

export type CodeSearchProvider = {
  id: string
  name: string
  apiKey: string
}

export type APISettings = {
  codeSearch: {
    activeProvider: string
    providers: CodeSearchProvider[]
  }
  llm: {
    providers: LLMProvider[]
  }
}

export type Viewport = {
  x: number
  y: number
  zoom: number
}

export type Canvas<N, E> = {
  nodes: N[]
  edges: E[]
  viewport: Viewport
}

export type Tab<N, E> = {
  id: string
  name: string
  createdAt: string
  canvas: Canvas<N, E>
}

export type AppData<N, E> = {
  version: number
  tabs: Tab<N, E>[]
  activeTabId: string | null
  apiSettings: APISettings
  ui: UISettings
}
