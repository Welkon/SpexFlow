import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defaultAPISettings, defaultAppData } from './defaultData.js'
import type {
  APISettings,
  AppData as AppDataBase,
  Canvas as CanvasBase,
  CodeSearchConductorData,
  CodeSearchData,
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
} from '../shared/appDataTypes.js'

type Position = { x: number; y: number }

type NonArchiveNodeType =
  | 'code-search'
  | 'code-search-conductor'
  | 'manual-import'
  | 'context-converter'
  | 'instruction'
  | 'llm'

type ArchivedMember = {
  id: string
  type: NonArchiveNodeType
  title: string
  customName?: string
  status: NodeStatus
  archivedAt: string
  snapshot: Record<string, unknown>
}

type ArchiveData = {
  title: string
  status: NodeStatus
  error: string | null
  locked: boolean
  muted: boolean
  customName?: string
  customColor?: string
  width?: number
  height?: number
  members: ArchivedMember[]
  output: string | null
}

export type AppNode =
  | {
    id: string
    type: 'code-search'
    position: Position
    data: CodeSearchData
  }
  | {
    id: string
    type: 'code-search-conductor'
    position: Position
    data: CodeSearchConductorData
  }
  | {
    id: string
    type: 'manual-import'
    position: Position
    data: ManualImportData
  }
  | {
    id: string
    type: 'context-converter'
    position: Position
    data: ContextConverterData
  }
  | {
    id: string
    type: 'instruction'
    position: Position
    data: InstructionData
  }
  | {
    id: string
    type: 'llm'
    position: Position
    data: LLMData
  }
  | {
    id: string
    type: 'archive'
    position: Position
    data: ArchiveData
  }

export type AppEdge = { id: string; source: string; target: string }

export type Canvas = CanvasBase<AppNode, AppEdge>
export type Tab = TabBase<AppNode, AppEdge>
export type AppData = AppDataBase<AppNode, AppEdge>

function normalizeStatus(status: unknown): NodeStatus {
  if (status === 'idle' || status === 'running' || status === 'success' || status === 'error') return status
  return 'idle'
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  if (!Number.isFinite(value)) return undefined
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null
}

function normalizeLineRangesRecord(raw: unknown): Record<string, [number, number][]> | undefined {
  const obj = asRecord(raw)
  if (!obj) return undefined

  const out: Record<string, [number, number][]> = {}
  for (const [filePath, value] of Object.entries(obj)) {
    if (!filePath) continue
    if (!Array.isArray(value)) continue

    const ranges: [number, number][] = []
    for (const item of value) {
      if (!Array.isArray(item) || item.length !== 2) continue
      const start = item[0]
      const end = item[1]
      if (typeof start !== 'number' || typeof end !== 'number') continue
      ranges.push([start, end])
    }

    if (ranges.length > 0) out[filePath] = ranges
  }

  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeNode(raw: unknown): AppNode | null {
  const obj = asRecord(raw)
  if (!obj) return null

  const data = asRecord(obj.data) ?? {}
  const position = asRecord(obj.position) ?? {}

  const id = normalizeString(obj.id)
  const type = obj.type
  if (!id) return null
  if (
    type !== 'code-search' &&
    type !== 'code-search-conductor' &&
    type !== 'manual-import' &&
    type !== 'context-converter' &&
    type !== 'instruction' &&
    type !== 'llm' &&
    type !== 'archive'
  ) return null
  const x = typeof position.x === 'number' ? position.x : 0
  const y = typeof position.y === 'number' ? position.y : 0

  const customNameRaw = normalizeString(data.customName, '').trim()
  const customColorRaw = normalizeString(data.customColor, '').trim()

  const base = {
    title: normalizeString(data.title, type),
    status: normalizeStatus(data.status),
    error: typeof data.error === 'string' ? data.error : null,
    locked: normalizeBool(data.locked, false),
    muted: normalizeBool(data.muted, false),
    width: normalizeOptionalNumber(data.width),
    height: normalizeOptionalNumber(data.height),
    customName: customNameRaw ? customNameRaw : undefined,
    customColor: customColorRaw ? customColorRaw : undefined,
  }

  if (type === 'archive') {
    const membersRaw = Array.isArray(data.members) ? data.members : []
    const members: ArchivedMember[] = membersRaw
      .map((m: unknown) => {
        const mObj = asRecord(m)
        if (!mObj) return null
        const memberId = normalizeString(mObj.id)
        if (!memberId) return null
        const memberType = mObj.type
        if (
          memberType !== 'code-search' &&
          memberType !== 'code-search-conductor' &&
          memberType !== 'manual-import' &&
          memberType !== 'context-converter' &&
          memberType !== 'instruction' &&
          memberType !== 'llm'
        ) return null

        const memberCustomNameRaw = normalizeString(mObj.customName, '').trim()
        const snapshot = asRecord(mObj.snapshot) ?? {}

        return {
          id: memberId,
          type: memberType,
          title: normalizeString(mObj.title, memberType),
          customName: memberCustomNameRaw ? memberCustomNameRaw : undefined,
          status: normalizeStatus(mObj.status),
          archivedAt: normalizeString(mObj.archivedAt, ''),
          snapshot,
        }
      })
      .filter(isNonNull)

    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        title: normalizeString(data.title, 'Archive'),
        members,
        output: typeof data.output === 'string' ? data.output : null,
      },
    }
  }

  if (type === 'code-search') {
    const output = asRecord(data.output)
    const normalizedOutput =
      output && typeof output.explanation === 'string' && typeof output.files === 'object'
        ? { explanation: output.explanation, files: output.files as Record<string, [number, number][]> }
        : null

    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        repoPath: normalizeString(data.repoPath),
        query: normalizeString(data.query),
        debugMessages: normalizeBool(data.debugMessages, false),
        output: normalizedOutput,
      },
    }
  }

  if (type === 'code-search-conductor') {
    const output = asRecord(data.output)
    let normalizedOutput: ConductorOutput | null = null
    if (output) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(output)) {
        if (typeof k === 'string' && typeof v === 'string' && v.trim()) out[k] = v
      }
      normalizedOutput = Object.keys(out).length > 0 ? out : null
    }

    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        model: normalizeString(data.model, 'x-ai/grok-4.1-fast'),
        query: normalizeString(data.query),
        output: normalizedOutput,
      },
    }
  }

  if (type === 'manual-import') {
    const itemsRaw = Array.isArray(data.items) ? data.items : []
    const items: ManualImportItem[] = itemsRaw
      .map((it: unknown) => {
        const itObj = asRecord(it)
        if (!itObj) return null
        const kind = itObj.kind
        const relPath = normalizeString(itObj.relPath)
        if ((kind !== 'file' && kind !== 'dir') || !relPath) return null
        return { kind, relPath }
      })
      .filter(isNonNull)

    const output = asRecord(data.output)
    const normalizedOutput =
      output && typeof output.explanation === 'string' && typeof output.files === 'object'
        ? { explanation: output.explanation, files: output.files as Record<string, [number, number][]> }
        : null

    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        repoPath: normalizeString(data.repoPath),
        items,
        output: normalizedOutput,
      },
    }
  }

  if (type === 'context-converter') {
    const mergedFiles = normalizeLineRangesRecord(data.mergedFiles)
    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        fullFile: normalizeBool(data.fullFile, false),
        output: typeof data.output === 'string' ? data.output : null,
        mergedFiles,
      },
    }
  }

  if (type === 'instruction') {
    return {
      id,
      type,
      position: { x, y },
      data: {
        ...base,
        text: normalizeString(data.text),
        output: typeof data.output === 'string' ? data.output : null,
      },
    }
  }

  return {
    id,
    type,
    position: { x, y },
    data: {
      ...base,
      model: normalizeString(data.model, 'anthropic/claude-3.5-haiku'),
      systemPrompt: normalizeString(data.systemPrompt),
      query: normalizeString(data.query),
      output: typeof data.output === 'string' ? data.output : null,
    },
  }
}

function normalizeAPISettings(raw: unknown): APISettings {
  const defaults = defaultAPISettings()
  const obj = asRecord(raw)
  if (!obj) return defaults

  const codeSearchRaw = asRecord(obj.codeSearch)
  const llmRaw = asRecord(obj.llm)

  // Normalize codeSearch
  const codeSearch = (() => {
    if (!codeSearchRaw) return defaults.codeSearch
    const activeProvider = normalizeString(codeSearchRaw.activeProvider, 'relace')
    const providersRaw = Array.isArray(codeSearchRaw.providers) ? codeSearchRaw.providers : []
    const providers: CodeSearchProvider[] = providersRaw
      .map((p: unknown) => {
        const pObj = asRecord(p)
        if (!pObj) return null
        const id = normalizeString(pObj.id)
        if (!id) return null
        return {
          id,
          name: normalizeString(pObj.name, id),
          apiKey: normalizeString(pObj.apiKey),
        }
      })
      .filter(isNonNull)
    
    return {
      activeProvider,
      providers: providers.length > 0 ? providers : defaults.codeSearch.providers,
    }
  })()

  // Normalize llm
  const llm = (() => {
    if (!llmRaw) return defaults.llm
    const providersRaw = Array.isArray(llmRaw.providers) ? llmRaw.providers : []
    const providers: LLMProvider[] = providersRaw
      .map((p: unknown) => {
        const pObj = asRecord(p)
        if (!pObj) return null
        const id = normalizeString(pObj.id)
        if (!id) return null
        const modelsRaw = Array.isArray(pObj.models) ? pObj.models : []
        const models: LLMModel[] = modelsRaw
          .map((m: unknown) => {
            const mObj = asRecord(m)
            if (!mObj) return null
            const mId = normalizeString(mObj.id)
            if (!mId) return null
            return {
              id: mId,
              name: normalizeString(mObj.name, mId),
            }
          })
          .filter(isNonNull)
        
        return {
          id,
          name: normalizeString(pObj.name, id),
          endpoint: normalizeString(pObj.endpoint),
          apiKey: normalizeString(pObj.apiKey),
          models,
        }
      })
      .filter(isNonNull)
    
    return {
      providers: providers.length > 0 ? providers : defaults.llm.providers,
    }
  })()

  return { codeSearch, llm }
}

function normalizeUISettings(raw: unknown): AppData['ui'] {
  const obj = asRecord(raw)
  const language = obj?.language
  if (language === 'en' || language === 'zh') return { language }
  return { language: 'en' }
}

function normalizeViewport(raw: unknown): Viewport {
  const obj = asRecord(raw)
  if (!obj) return { x: 0, y: 0, zoom: 1 }
  return {
    x: typeof obj.x === 'number' ? obj.x : 0,
    y: typeof obj.y === 'number' ? obj.y : 0,
    zoom: typeof obj.zoom === 'number' ? obj.zoom : 1,
  }
}

function normalizeAppData(raw: unknown): AppData {
  // @@@appdata-migration - data.json is persisted; normalize older shapes (e.g. missing `locked`) for UI stability
  const now = new Date().toISOString()
  const root = asRecord(raw) ?? {}
  const tabsRaw = Array.isArray(root.tabs) ? root.tabs : []
  const tabs: Tab[] = tabsRaw
    .map((t: unknown): Tab | null => {
      const tab = asRecord(t) ?? {}
      const id = normalizeString(tab.id)
      if (!id) return null
      const canvas = asRecord(tab.canvas) ?? {}
      const nodesRaw = Array.isArray(canvas.nodes) ? canvas.nodes : []
      const edgesRaw = Array.isArray(canvas.edges) ? canvas.edges : []
      const nodes = nodesRaw.map(normalizeNode).filter(isNonNull)
      const edges = edgesRaw
        .map((e: unknown) => {
          const edge = asRecord(e) ?? {}
          return {
            id: normalizeString(edge.id),
            source: normalizeString(edge.source),
            target: normalizeString(edge.target),
          }
        })
        .filter((e) => e.id && e.source && e.target)

      const viewport = normalizeViewport(canvas.viewport)

      return {
        id,
        name: normalizeString(tab.name, 'Canvas'),
        createdAt: normalizeString(tab.createdAt, now),
        canvas: { nodes, edges, viewport },
      }
    })
    .filter(isNonNull)

  const activeTabIdRaw = normalizeString(root.activeTabId)
  const activeTabId = tabs.some((t) => t.id === activeTabIdRaw) ? activeTabIdRaw : (tabs[0]?.id ?? null)
  const apiSettings = normalizeAPISettings(root.apiSettings)
  const ui = normalizeUISettings(root.ui)
  if (tabs.length === 0) return { ...defaultAppData(), apiSettings, ui }
  return {
    version: typeof root.version === 'number' ? root.version : 1,
    tabs,
    activeTabId,
    apiSettings,
    ui,
  }
}

const dataPath = path.join(process.cwd(), 'data.json')

export async function loadAppData(): Promise<AppData> {
  let raw: string
  try {
    raw = await readFile(dataPath, 'utf-8')
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return defaultAppData()
    throw err
  }

  try {
    return normalizeAppData(JSON.parse(raw))
  } catch (err: unknown) {
    console.error(err)
    return defaultAppData()
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  const raw = JSON.stringify(data, null, 2)
  await writeFile(dataPath, raw, 'utf-8')
}

export async function getCodeSearchApiKey(): Promise<string | null> {
  const appData = await loadAppData()
  const activeProviderId = appData.apiSettings.codeSearch.activeProvider
  const provider = appData.apiSettings.codeSearch.providers.find(p => p.id === activeProviderId)
  const apiKey = provider?.apiKey?.trim()
  return apiKey || null
}

export type LLMProviderConfig = {
  endpoint: string
  apiKey: string
} | null

export async function getLLMProviderByModel(modelId: string): Promise<LLMProviderConfig> {
  const appData = await loadAppData()
  for (const provider of appData.apiSettings.llm.providers) {
    const model = provider.models.find(m => m.id === modelId)
    if (model && provider.apiKey?.trim() && provider.endpoint?.trim()) {
      return {
        endpoint: provider.endpoint.trim(),
        apiKey: provider.apiKey.trim(),
      }
    }
  }
  return null
}
