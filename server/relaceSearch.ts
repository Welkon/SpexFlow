import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeSearchRunDump } from './searchRunLog.js'
import { formatPathValidationFeedback, validateFilePaths } from './pathValidator.js'

const execFileAsync = promisify(execFile)

const MAX_TOOL_OUTPUT_CHARS = 12_000
const MAX_VIEW_FILE_LINES = 400
const MAX_PATH_VALIDATION_RETRIES = 3
const MAX_FORCED_REPORT_TURNS = 6
const MAX_TOTAL_TURNS = 30

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant'
      content?: string | null
      tool_calls?: ToolCall[]
    }
  | { role: 'tool'; tool_call_id: string; content: string }

type ReportBackPayload = {
  explanation: string
  files: Record<string, [number, number][]>
}

type RunRelaceSearchArgs = {
  apiKey: string
  repoRoot: string
  userQuery: string
  maxTurns?: number
  debugMessages?: boolean
  runId?: string
  dumpMessages?: boolean
  dumpOnError?: boolean
}

type SearchTraceEntry = {
  turn: number
  toolCalls: string[]
  pathValidationRetry?: boolean
  invalidPaths?: string[]
}

export type RunRelaceSearchResult = {
  report: ReportBackPayload
  trace: SearchTraceEntry[]
  messageStats?: { turn: number; messagesChars: number; messagesCount: number }[]
  messageDumpPath?: string
}

function buildSystemPrompt() {
  return [
    'You are an AI agent whose job is to explore a code base with the provided tools and thoroughly understand the problem.',
    '',
    'You should use the tools provided to explore the codebase, read files, search for specific terms, and execute bash commands as needed.',
    '',
    'Once you have a good understanding of the problem, use the `report_back` tool share your findings. Make sure to only use the `report_back` tool when you are confident that you have gathered enough information to make an informed decision.',
    '',
    'Your objective is speed and efficiency so call multiple tools at once where applicable to reduce latency and reduce the number of turns.',
    '',
    'You are given a limited number of turns so aim to call 4-12 tools in parallel. You are suggested to explain your reasoning for the tools you choose to call before calling them.',
  ].join('\n')
}

function buildUserPrompt(userQuery: string) {
  return [
    'I have uploaded a code repository in the /repo directory.',
    '',
    'Now consider the following user query:',
    '',
    '<user_query>',
    userQuery,
    '</user_query>',
    '',
    'You need to resolve the <user_query>.',
    '',
    'To do this, follow the workflow below:',
    '',
    '---',
    '',
    'Your job is purely to understand the codebase.',
    '',
    '### 1. Explore and Understand the Codebase',
    '',
    'You **must first build a deep understanding of the relevant code**.',
    '',
    'Use the available tools to:',
    '',
    '- Locate and examine all relevant parts of the codebase.',
    '- Understand how the current code works, including expected behaviors, control flow, and edge cases.',
    '- Identify the potential root cause(s) of the issue or the entry points for the requested feature.',
    '- Review any related unit tests to understand expected behavior.',
    '',
    '---',
    '',
    '### 2. Report Back Your Understanding',
    '',
    'Once you believe you have a solid understanding of the issue and the relevant code:',
    '',
    '- Use the `report_back` tool to report you findings.',
    '  - File paths should be relative to the project root excluding the base `/repo/` failure to comply will result in deductions.',
    '  - Only report the relevant files within the repository.',
    '',
    '---',
    '',
    '### Success Criteria',
    '',
    'A successful resolution means:',
    '',
    '- The specific issue in the <user_query> is well understood.',
    '- Your explain clearly the reasoning behind marking code as relavent.',
    '- The files comprehensively covers all the key files needed to address the query.',
  ].join('\n')
}

const relaceTools = [
  {
    type: 'function',
    function: {
      name: 'view_file',
      strict: true,
      description:
        'Tool for viewing/exploring the contents of existing files\n\nLine numbers are included in the output, indexing at 1. If the output does not include the end of the file, it will be noted after the final output line.\n\nExample (viewing the first 2 lines of a file):\n1   def my_function():\n2       print("Hello, World!")\n... rest of file truncated ...',
      parameters: {
        type: 'object',
        required: ['path', 'view_range'],
        properties: {
          path: { type: 'string', description: 'Absolute path to a file, e.g. `/repo/file.py`.' },
          view_range: {
            type: 'array',
            items: { type: 'integer' },
            default: [1, 100],
            description:
              'Range of file lines to view. If not specified, the first 100 lines of the file are shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_directory',
      strict: true,
      description:
        "Tool for viewing the contents of a directory.\n\n* Lists contents recursively, relative to the input directory\n* Directories are suffixed with a trailing slash '/'\n* Depth might be limited by the tool implementation\n* Output is limited to the first 250 items\n\nExample output:\nfile1.txt\nfile2.txt\nsubdir1/\nsubdir1/file3.txt",
      parameters: {
        type: 'object',
        required: ['path', 'include_hidden'],
        properties: {
          path: { type: 'string', description: 'Absolute path to a directory, e.g. `/repo/`.' },
          include_hidden: {
            type: 'boolean',
            default: false,
            description: 'If true, include hidden files in the output (false by default).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      strict: true,
      description:
        'Fast text-based regex search that finds exact pattern matches within files or directories, utilizing the ripgrep command for efficient searching. Results will be formatted in the style of ripgrep and can be configured to include line numbers and content. To avoid overwhelming output, the results are capped at 50 matches. Use the include or exclude patterns to filter the search scope by file type or specific paths. This is best for finding exact text matches or regex patterns.',
      parameters: {
        type: 'object',
        required: ['query', 'case_sensitive', 'exclude_pattern', 'include_pattern'],
        properties: {
          query: { type: 'string', description: 'The regex pattern to search for' },
          case_sensitive: {
            type: 'boolean',
            default: true,
            description: 'Whether the search should be case sensitive',
          },
          exclude_pattern: { type: ['string', 'null'], description: 'Glob pattern for files to exclude' },
          include_pattern: {
            type: ['string', 'null'],
            description: "Glob pattern for files to include (e.g. '*.ts' for TypeScript files)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      strict: true,
      description:
        'Tool for executing bash commands.\n\n* Avoid long running commands\n* Avoid dangerous/destructive commands\n* Prefer using other more specialized tools where possible',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: { command: { type: 'string', description: 'Bash command to execute' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'report_back',
      strict: true,
      description:
        'This is a tool to use when you feel like you have finished exploring the codebase and understanding the problem, and now would like to report back to the user.',
      parameters: {
        type: 'object',
        required: ['explanation', 'files'],
        properties: {
          explanation: { type: 'string', description: 'Details your reasoning for deeming the files relevant.' },
          files: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                prefixItems: [{ type: 'integer' }, { type: 'integer' }],
              },
            },
            description:
              'A dictionary where the keys are file paths and the values are lists of tuples representing the line ranges in each file that are relevant.',
          },
        },
        additionalProperties: false,
      },
    },
  },
] as const

type RepoPathResult = { ok: true; path: string } | { ok: false; error: string }

function safeRequireRepoPath(repoRoot: string, toolPath: string): RepoPathResult {
  // @@@repo-path-mapping - model assumes `/repo`, we map to user-provided local dir
  if (toolPath === '/repo' || toolPath === '/repo/') return { ok: true, path: repoRoot }
  if (!toolPath.startsWith('/repo/')) {
    return { ok: false, error: `Error: Tool path must start with /repo/: got ${toolPath}` }
  }
  const posixRemainder = path.posix.normalize(toolPath.slice('/repo/'.length))
  if (posixRemainder.startsWith('..')) {
    return { ok: false, error: `Error: Path escapes /repo: ${toolPath}` }
  }
  return { ok: true, path: path.join(repoRoot, ...posixRemainder.split('/')) }
}

function truncateToolOutput(label: string, content: string) {
  if (content.length <= MAX_TOOL_OUTPUT_CHARS) return content
  const head = content.slice(0, MAX_TOOL_OUTPUT_CHARS)
  return [
    `@@@truncated-tool-output - ${label} chars=${content.length} kept=${MAX_TOOL_OUTPUT_CHARS}`,
    head,
    '... (truncated) ...',
  ].join('\n')
}

function getMessagesStats(messages: ChatMessage[]) {
  const messagesCount = messages.length
  let messagesChars = 0

  for (const m of messages) {
    if (m.role === 'system' || m.role === 'user') {
      messagesChars += m.content.length
      continue
    }
    if (m.role === 'tool') {
      messagesChars += m.content.length
      continue
    }
    if (m.role === 'assistant') {
      if (typeof m.content === 'string') messagesChars += m.content.length
      const calls = m.tool_calls ?? []
      for (const c of calls) {
        messagesChars += c.function.name.length
        messagesChars += c.function.arguments?.length ?? 0
      }
      continue
    }
  }

  return { messagesChars, messagesCount }
}

async function viewFile(repoRoot: string, args: { path: string; view_range: [number, number] }) {
  const resolvedResult = safeRequireRepoPath(repoRoot, args.path)
  if (!resolvedResult.ok) return resolvedResult.error

  const resolved = resolvedResult.path
  let content: string
  try {
    content = await readFile(resolved, 'utf-8')
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return `Error: File not found: ${args.path}`
    if (e.code === 'EACCES') return `Error: Permission denied: ${args.path}`
    if (e.code === 'EISDIR') return `Error: Path is a directory, not a file: ${args.path}`
    return `Error: Failed to read file ${args.path}: ${e.message}`
  }

  const lines = content.split('\n')

  const startLine = Math.max(1, args.view_range[0] ?? 1)
  const endRaw = args.view_range[1] ?? 100
  const requestedEnd = endRaw === -1 ? lines.length : Math.max(startLine, endRaw)
  const endLine = Math.min(requestedEnd, startLine + MAX_VIEW_FILE_LINES - 1)

  const slice = lines.slice(startLine - 1, endLine)
  const body = slice.map((line, idx) => `${startLine + idx}   ${line}`).join('\n')

  if (endLine < requestedEnd || requestedEnd < lines.length) {
    return truncateToolOutput(
      `view_file ${args.path} lines=${lines.length} shown=${startLine}-${endLine}`,
      `${body}\n... rest of file truncated ...`,
    )
  }
  return truncateToolOutput(`view_file ${args.path}`, body)
}

async function viewDirectory(repoRoot: string, args: { path: string; include_hidden: boolean }) {
  const resolvedResult = safeRequireRepoPath(repoRoot, args.path)
  if (!resolvedResult.ok) return resolvedResult.error

  const resolvedRoot = resolvedResult.path
  const out: string[] = []
  const limit = 250

  async function walk(dirAbs: string, baseAbs: string) {
    if (out.length >= limit) return
    let entries
    try {
      entries = await readdir(dirAbs, { withFileTypes: true })
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      // @@@walk-errors - subdirectory errors are logged inline rather than aborting
      const rel = path.relative(baseAbs, dirAbs).split(path.sep).join('/') || '.'
      out.push(`[Error reading ${rel}: ${e.code ?? e.message}]`)
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (out.length >= limit) return
      if (!args.include_hidden && entry.name.startsWith('.')) continue

      const abs = path.join(dirAbs, entry.name)
      const rel = path.relative(baseAbs, abs).split(path.sep).join('/')
      if (entry.isDirectory()) {
        out.push(`${rel}/`)
        await walk(abs, baseAbs)
      } else {
        out.push(rel)
      }
    }
  }

  try {
    const rootStat = await stat(resolvedRoot)
    if (!rootStat.isDirectory()) {
      return `Error: Path is not a directory: ${args.path}`
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return `Error: Directory not found: ${args.path}`
    if (e.code === 'EACCES') return `Error: Permission denied: ${args.path}`
    return `Error: Failed to access directory ${args.path}: ${e.message}`
  }

  await walk(resolvedRoot, resolvedRoot)
  return truncateToolOutput(`view_directory ${args.path}`, out.join('\n'))
}

async function grepSearch(
  repoRoot: string,
  args: {
    query: string
    case_sensitive: boolean
    exclude_pattern: string | null
    include_pattern: string | null
  },
) {
  const rgArgs: string[] = [
    '--color',
    'never',
    '--no-heading',
    '--line-number',
    '--max-count',
    '50',
  ]
  if (!args.case_sensitive) rgArgs.push('-i')
  if (args.exclude_pattern) rgArgs.push('--glob', `!${args.exclude_pattern}`)
  if (args.include_pattern) rgArgs.push('--glob', args.include_pattern)
  rgArgs.push(args.query, repoRoot)

  try {
    const { stdout } = await execFileAsync('rg', rgArgs, { maxBuffer: 1024 * 1024 })
    return truncateToolOutput('grep_search', stdout.trimEnd())
  } catch (err: unknown) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'number' && code === 1) return 'No matches found.'
    // @@@grep-error-feedback - return error details to model instead of throwing
    const stderr = (err as { stderr?: unknown }).stderr
    const stdout = (err as { stdout?: unknown }).stdout
    const stderrText = typeof stderr === 'string' ? stderr : ''
    const stdoutText = typeof stdout === 'string' ? stdout : ''
    const details = [stderrText, stdoutText].filter(Boolean).join('\n').trim()
    return `Error: grep_search failed (exit=${code ?? 'unknown'}): ${details || String(err)}`
  }
}

async function bashTool(repoRoot: string, args: { command: string }) {
  const command = args.command.replaceAll('/repo', repoRoot)
  try {
    const { stdout, stderr } = await execFileAsync('/bin/bash', ['-lc', command], {
      cwd: repoRoot,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    })
    return truncateToolOutput('bash', `${stdout}${stderr}`.trimEnd())
  } catch (err: unknown) {
    // @@@bash-exit-codes - bash pipelines often return non-zero (e.g. grep no-match); return details to the model instead of aborting the whole run
    const code = (err as { code?: unknown }).code
    const stdout = (err as { stdout?: unknown }).stdout
    const stderr = (err as { stderr?: unknown }).stderr
    const stdoutText = typeof stdout === 'string' ? stdout : ''
    const stderrText = typeof stderr === 'string' ? stderr : ''
    return truncateToolOutput(
      'bash',
      [`Command failed (exit=${code ?? 'unknown'})`, stdoutText, stderrText].filter(Boolean).join('\n').trimEnd(),
    )
  }
}

async function callRelace(apiKey: string, messages: ChatMessage[]) {
  const url = 'https://search.endpoint.relace.run/v1/search/chat/completions'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'relace-search',
        messages,
        tools: relaceTools,
        tool_choice: 'auto',
        temperature: 1.0,
        top_k: 100,
        top_p: 0.95,
        repetition_penalty: 1.0,
      }),
      signal: controller.signal,
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = null
    }

    if (!res.ok) {
      throw new Error(
        `Relace API error: status=${res.status} body=${data !== null ? JSON.stringify(data) : text.slice(0, 1000)}`,
      )
    }

    if (!data) {
      throw new Error(`Relace API error: status=${res.status} invalid_json=${text.slice(0, 1000)}`)
    }

    return data
  } finally {
    clearTimeout(timeout)
  }
}

export async function runRelaceSearch(args: RunRelaceSearchArgs): Promise<RunRelaceSearchResult> {
  const maxTurns = Math.min(args.maxTurns ?? 12, MAX_TOTAL_TURNS)
  const maxTotalTurns = Math.min(maxTurns + MAX_FORCED_REPORT_TURNS, MAX_TOTAL_TURNS)
  const dumpOnError = args.dumpOnError ?? true
  const debugMessages = args.debugMessages ?? false

  const repoStat = await stat(args.repoRoot)
  if (!repoStat.isDirectory()) throw new Error(`repoRoot is not a directory: ${args.repoRoot}`)

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(args.userQuery) },
  ]

  const trace: SearchTraceEntry[] = []
  const messageStats: { turn: number; messagesChars: number; messagesCount: number }[] = []
  let messageDumpPath: string | undefined
  let pathValidationRetries = 0

  async function stepOnce(turn: number) {
    messageStats.push({ turn, ...getMessagesStats(messages) })
    const completion = await callRelace(args.apiKey, messages)
    const assistant = completion?.choices?.[0]?.message
    if (!assistant) throw new Error(`Unexpected response: ${JSON.stringify(completion)}`)

    messages.push({
      role: 'assistant',
      content: assistant.content ?? null,
      tool_calls: assistant.tool_calls ?? [],
    })

    const toolCalls: ToolCall[] = assistant.tool_calls ?? []
    trace.push({ turn, toolCalls: toolCalls.map((t) => t.function.name) })

    const reportCall = toolCalls.find((t) => t.function.name === 'report_back')
    if (reportCall) {
      let parsed: ReportBackPayload
      try {
        parsed = JSON.parse(reportCall.function.arguments) as ReportBackPayload
      } catch {
        throw new Error(`Invalid report_back arguments: ${reportCall.function.arguments}`)
      }
      return parsed
    }

    if (toolCalls.length === 0) {
      throw new Error(`Model returned no tool calls before report_back. content=${assistant.content ?? ''}`)
    }

    // @@@tool-error-safety - catch all tool errors and return them as feedback to the model
    const toolResults = await Promise.all(
      toolCalls.map(async (call) => {
        const name = call.function.name
        try {
          let rawArgs: unknown
          try {
            rawArgs = JSON.parse(call.function.arguments ?? '{}')
          } catch {
            return { tool_call_id: call.id, content: `Error: Invalid JSON arguments for tool ${name}: ${call.function.arguments}` }
          }

          if (name === 'view_file') {
            const content = await viewFile(args.repoRoot, rawArgs as Parameters<typeof viewFile>[1])
            return { tool_call_id: call.id, content }
          }
          if (name === 'view_directory') {
            const content = await viewDirectory(args.repoRoot, rawArgs as Parameters<typeof viewDirectory>[1])
            return { tool_call_id: call.id, content }
          }
          if (name === 'grep_search') {
            const content = await grepSearch(args.repoRoot, rawArgs as Parameters<typeof grepSearch>[1])
            return { tool_call_id: call.id, content }
          }
          if (name === 'bash') {
            const content = await bashTool(args.repoRoot, rawArgs as Parameters<typeof bashTool>[1])
            return { tool_call_id: call.id, content }
          }

          return { tool_call_id: call.id, content: `Error: Unknown tool: ${name}` }
        } catch (err) {
          // Last-resort catch for any unexpected error that slips through
          const message = err instanceof Error ? err.message : String(err)
          return { tool_call_id: call.id, content: `Error: Tool "${name}" failed unexpectedly: ${message}` }
        }
      }),
    )

    for (const result of toolResults) {
      messages.push({ role: 'tool', tool_call_id: result.tool_call_id, content: result.content })
    }

    return null
  }

  async function maybeDump(reason: string) {
    if (!args.runId) return
    if (!args.dumpMessages && reason !== 'error') return
    // @@@message-dump - store the actual message history for token/debug inspection (tool outputs are already capped)
    messageDumpPath = await writeSearchRunDump(args.runId, {
      runId: args.runId,
      reason,
      userQuery: args.userQuery,
      repoRoot: args.repoRoot,
      maxTurns,
      trace,
      messageStats,
      messages,
    })
  }

  async function finalizeReport(report: ReportBackPayload, turn: number) {
    const filePaths = Object.keys(report.files ?? {})
    if (filePaths.length === 0) {
      await maybeDump('success')
      return { report, trace, messageStats, messageDumpPath }
    }

    if (debugMessages) {
      console.log(`[Turn ${turn}] Validating ${filePaths.length} file paths...`)
    }
    const validation = await validateFilePaths(args.repoRoot, filePaths)

    if (debugMessages) {
      console.log(
        `[Turn ${turn}] Valid: ${validation.valid.length}, Invalid: ${validation.invalid.length}`,
      )
      if (validation.invalid.length > 0) {
        console.log(`[Turn ${turn}] Invalid paths:`, validation.invalid)
      }
    }

    if (validation.invalid.length > 0) {
      pathValidationRetries += 1
      const traceEntry = trace[trace.length - 1]
      if (traceEntry) {
        traceEntry.pathValidationRetry = true
        traceEntry.invalidPaths = validation.invalid
      }

      if (debugMessages) {
        console.log(`[Turn ${turn}] Retry ${pathValidationRetries}/${MAX_PATH_VALIDATION_RETRIES}`)
      }

      if (pathValidationRetries >= MAX_PATH_VALIDATION_RETRIES) {
        console.warn(
          `Path validation failed after ${pathValidationRetries} retries. Returning partial results without invalid paths: ${validation.invalid.join(', ')}`,
        )
        if (validation.valid.length === 0) {
          console.warn('All returned file paths were invalid. Returning empty result.')
        }

        const filteredFiles: Record<string, [number, number][]> = {}
        for (const validPath of validation.valid) {
          if (report.files[validPath]) {
            filteredFiles[validPath] = report.files[validPath]
          }
        }

        const explanation =
          validation.valid.length === 0
            ? `${report.explanation}\n\n[Note: All file paths returned were invalid and have been removed]`
            : report.explanation

        await maybeDump('success')
        return {
          report: {
            explanation,
            files: filteredFiles,
          },
          trace,
          messageStats,
          messageDumpPath,
        }
      }

      const feedbackMessage = formatPathValidationFeedback(validation.invalid)
      messages.push({ role: 'user', content: feedbackMessage })
      return null
    }

    await maybeDump('success')
    return { report, trace, messageStats, messageDumpPath }
  }

  try {
    for (let turn = 1; turn <= maxTurns; turn++) {
      // @@@tool-loop - run tool calls in parallel, stop only at `report_back`
      const report = await stepOnce(turn)
      if (report) {
        const done = await finalizeReport(report, turn)
        if (done) return done
      }
    }

    const forcedTurns = Math.max(0, maxTotalTurns - maxTurns)
    if (forcedTurns > 0) {
      // @@@force-report - if the model doesn't terminate, explicitly require report_back
      messages.push({
        role: 'user',
        content:
          'Stop exploring now. You must call report_back with your best current understanding. Do not call any other tool.',
      })
      for (let turn = maxTurns + 1; turn <= maxTurns + forcedTurns; turn++) {
        const report = await stepOnce(turn)
        if (report) {
          const done = await finalizeReport(report, turn)
          if (done) return done
        }
      }
    }

    throw new Error(`Exceeded maxTotalTurns (${maxTotalTurns}) without report_back.`)
  } catch (err) {
    if (dumpOnError) {
      await maybeDump('error')
    }
    throw err
  }
}
