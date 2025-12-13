# SpecFlow

SpecFlow loads local code repos and lets you run a small node-based workflow:

- **Code Search** (Relace fast agentic search) → returns `{ explanation, files }`
- **Context Converter** → turns file ranges into plain text context
- **LLM** → takes plain text context + prompt and generates a spec / plan

## Dev

- Install: `pnpm install`
- Run: `pnpm dev` (web + server)
- Health: `curl http://localhost:3001/api/health`

## Warning: Huge Search Outputs

The Code Search agent has a `bash` tool that may execute commands like `grep -r ... /repo`.
If your `repoPath` includes build outputs (like `dist/`) or other generated/minified files, a single match can print **hundreds of KB** (minified bundles often have enormous single-line content). This can blow up message size and trigger “maximum context length” errors even on small repos.

Do this instead:

- Point `repoPath` to your **source root** (e.g. `src/`) instead of the repo root when possible.
- Avoid searching `dist/` and `node_modules/` when using `bash`-style grep.
- Turn on **`debugMessages`** on the Code Search node to save the full raw message dump for inspection under `logs/relace-search-runs/<runId>.json`.
