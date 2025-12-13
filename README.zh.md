# SpecFlow

[English](README.md) | 简体中文

SpecFlow 用来加载本地代码仓库，并用一个小型「节点工作流」跑通：

- **Instruction** → 生成/组合纯文本输入
- **Code Search Conductor** → 为多个下游 Code Search 节点分别生成互补的搜索查询
- **Code Search**（Relace fast agentic search）→ 返回 `{ explanation, files }`
- **Manual Import** → 手动选择文件/文件夹并产出同样的 `{ explanation, files }` 结构（不做外部搜索）
- **Context Converter** → 把文件片段转成带行号的文本上下文
- **LLM** → 输入上下文 + prompt，生成输出（spec/plan 等）

## 节点类型与连线规则

| Source（输出）↓ \\ Target（输入）→ | instruction | code-search-conductor | manual-import | code-search | context-converter | llm |
|-----------------------------------|:-----------:|:---------------------:|:------------:|:-----------:|:-----------------:|:---:|
| **instruction**                   | ✅          | ✅                    | ❌           | ✅          | ❌                | ✅  |
| **code-search-conductor**         | ❌          | ❌                    | ❌           | ✅          | ❌                | ❌  |
| **manual-import**                 | ❌          | ❌                    | ❌           | ❌          | ✅                | ❌  |
| **code-search**                   | ❌          | ❌                    | ❌           | ❌          | ✅                | ❌  |
| **context-converter**             | ✅          | ✅                    | ❌           | ✅          | ❌                | ✅  |
| **llm**                           | ✅          | ✅                    | ❌           | ✅          | ❌                | ✅  |

典型工作流：

```
instruction → code-search → context-converter → llm
```

```
instruction → code-search-conductor → code-search → context-converter → llm
```

```
manual-import → context-converter → llm
```

## 开发

- 安装：`pnpm install`
- 启动：`pnpm dev`（web + server）
- 健康检查：`curl http://localhost:3001/api/health`

## Key 与设置

- Code Search（Relace）：优先在 **Settings** 里配置；否则后端会回退读取 `.apikey`
- LLM：在 **Settings** 里配置 provider / model（需要 OpenAI 兼容接口）。未配置时后端会回退到 OpenRouter（`.llmkey`）
- UI 语言：在 **Settings** 里切换（English / 中文）

## Manual Import（手动导入）

- 文件夹不递归（只包含该目录的直接子文件）。
- 只包含“信任后缀名”的文件（目前硬编码在 `server/repoBrowser.ts`）。
- 不会持久化文件内容；每次运行都会在磁盘上校验路径，Context Converter 按需读取文件内容。
- 节点类型 id：`manual-import`（输出结构与 Code Search 相同：`{ explanation, files }`）。

## 警告：搜索输出可能很大

Code Search agent 带一个 `bash` 工具，可能会执行类似 `grep -r ... /repo` 的命令。
如果你的 `repoPath` 包含 `dist/` 之类的构建产物或压缩文件，一次命中可能输出数百 KB（单行超长的 bundle 很常见），容易导致上下文爆炸。

建议：

- 尽量让 `repoPath` 指向源码根目录（例如 `src/`），而不是整个仓库根目录。
- grep 类搜索尽量排除 `dist/` 和 `node_modules/`。
- 打开 Code Search 节点的 `debugMessages`，把完整 message dump 写到 `logs/relace-search-runs/<runId>.json` 方便排查。
