# SpecFlow

English | [简体中文](README.zh.md)

SpecFlow loads a local code repo and lets you run a small node-based workflow:

- **Instruction** → produce/compose plain text input
- **Code Search Conductor** → generate multiple complementary search queries (one per downstream Code Search node)
- **Code Search** (Relace fast agentic search) → returns `{ explanation, files }`
- **Manual Import** → select files/folders and produce the same `{ explanation, files }` shape (no external search)
- **Context Converter** → turns file ranges into line-numbered text context
- **LLM** → takes context + prompt and generates an output (spec/plan/etc.)

## Node Types & Connection Rules

| Source (output) ↓ \\ Target (input) → | instruction | code-search-conductor | manual-import | code-search | context-converter | llm |
|--------------------------------------|:-----------:|:---------------------:|:------------:|:-----------:|:-----------------:|:---:|
| **instruction**                      | ✅          | ✅                    | ❌           | ✅          | ❌                | ✅  |
| **code-search-conductor**            | ❌          | ❌                    | ❌           | ✅          | ❌                | ❌  |
| **manual-import**                    | ❌          | ❌                    | ❌           | ❌          | ✅                | ❌  |
| **code-search**                      | ❌          | ❌                    | ❌           | ❌          | ✅                | ❌  |
| **context-converter**                | ✅          | ✅                    | ❌           | ✅          | ❌                | ✅  |
| **llm**                              | ✅          | ✅                    | ❌           | ✅          | ❌                | ✅  |

Typical workflows:

```
instruction → code-search → context-converter → llm
```

```
instruction → code-search-conductor → code-search → context-converter → llm
```

```
manual-import → context-converter → llm
```

## Dev

- Install: `pnpm install`
- Run: `pnpm dev` (web + server)
- Health: `curl http://localhost:3001/api/health`

## Keys & Settings

- Code Search (Relace): set via **Settings** UI (recommended), or fallback `.apikey`
- LLM: configure providers/models in **Settings** (OpenAI-compatible endpoints). If not configured, server falls back to OpenRouter via `.llmkey`
- UI language: toggle in **Settings** (English / 中文)

## Manual Import

- Folders are non-recursive (only direct child files are included).
- Only “trusted” file extensions are included (currently hardcoded in `server/repoBrowser.ts`).
- No file contents are persisted; every run validates paths on disk and Context Converter reads files on demand.
- Node type id: `manual-import` (outputs the same `{ explanation, files }` shape as Code Search).

## Warning: Huge Search Outputs

The Code Search agent can run `bash` tool calls that may execute commands like `grep -r ... /repo`.
If your `repoPath` includes build outputs (like `dist/`) or other generated/minified files, a single match can print hundreds of KB (minified bundles often have enormous single-line content).

Do this instead:

- Point `repoPath` to your source root (e.g. `src/`) instead of the repo root when possible.
- Avoid searching `dist/` and `node_modules/` when using grep-like searches.
- Turn on `debugMessages` on the Code Search node to save the full raw message dump under `logs/relace-search-runs/<runId>.json`.
