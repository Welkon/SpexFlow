# Overview

> Learn how the harness that runs fast agentic search works.

If you're using Fast Agentic Search outside of Relace Repos, you'll need to build an agent harness equipped with a specific set of tools the underlying model was trained to use.

## Agent Flow

First let's understand how the search agent operates:

* The inputs are: a `codebase` and a `user_prompt`
* The agent is initialized with five search tools: `view_file`, `view_directory`, `grep_search`, `bash`, `report_back`
* The system prompt defines the search task and how to format parallel tool calls
* Agent goes through 4-5 turns of parallel tool calls to quickly explore codebase
* Agent returns its findings with the `report_back` tool

You'll need to define the schema for the search tools that you pass to the model, and actually write the code that implements these tool calls. Here's an example of what the flow would look like:

**Example**

```text expandable theme={null}
Agent calls: view_file("/repo/src/auth/login.py", [1, 50])
    ↓
Your backend: Reads lines 1-50 from the file
    ↓
Return to agent: File contents with line numbers
    ↓
Agent calls: grep_search("authenticate", case_sensitive=false, ...)
    ↓
Your backend: Runs ripgrep search
    ↓
Return to agent: Search results
    ↓
... (multiple turns of exploration)
    ↓
Agent calls: report_back(explanation="...", files={...})
    ↓
Your system: Process the final findings
```

## Model Endpoint

If you already have an agent harness and want to get started quickly, you can try this OpenAI compatible endpoint.

```typescript  theme={null}
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.RELACE_API_KEY,
  baseUrl: 'https://search.endpoint.relace.run/v1/search',
});

const response = await client.chat.completions.create({
  model: 'relace-search',
  messages: [{ role: 'user', content: 'Find authentication logic in /repo' }],
  tools: [
    /* tool definitions below */
  ],
});
```

<Warning>
  Deviating from the toolsets & schemas defined in this guide can lead to
  unexpected behavior. The fast agentic search model is reinforced to correctly
  format tool calls with these specific parameters.
</Warning>

## System Prompt

Use the following system prompt to configure the Fast Agentic Search agent:

```text Expandable theme={null}
You are an AI agent whose job is to explore a code base with the provided tools and thoroughly understand the problem.

You should use the tools provided to explore the codebase, read files, search for specific terms, and execute bash commands as needed.

Once you have a good understanding of the problem, use the `report_back` tool share your findings. Make sure to only use the `report_back` tool when you are confident that you have gathered enough information to make an informed decision.

Your objective is speed and efficiency so call multiple tools at once where applicable to reduce latency and reduce the number of turns.

You are given a limited number of turns so aim to call 4-12 tools in parallel. You are suggested to explain your reasoning for the tools you choose to call before calling them.
```

## User Prompt Template

Structure your user prompts using the following template:

```text Expandable theme={null}
I have uploaded a code repository in the {{repo_root}} directory.

Now consider the following user query:

<user_query>
{{prompt}}
</user_query>

You need to resolve the <user_query>.

To do this, follow the workflow below:

---

Your job is purely to understand the codebase.

### 1. Explore and Understand the Codebase

You **must first build a deep understanding of the relevant code**.

Use the available tools to:

- Locate and examine all relevant parts of the codebase.
- Understand how the current code works, including expected behaviors, control flow, and edge cases.
- Identify the potential root cause(s) of the issue or the entry points for the requested feature.
- Review any related unit tests to understand expected behavior.

---

### 2. Report Back Your Understanding

Once you believe you have a solid understanding of the issue and the relevant code:

- Use the `report_back` tool to report you findings.
  - File paths should be relative to the project root excluding the base `/repo/` failure to comply will result in deductions.
  - Only report the relevant files within the repository. You may speculate that a file or folder may be added in your explaination, but it must not be put within you reported files.

---

### Success Criteria

A successful resolution means:

- The specific issue in the <user_query> is well understood.
- Your explain clearly the reasoning behind marking code as relavent.
- The files comprehensively covers all the key files needed to address the query.
  - Relevant files can be any of three types:
    - Files needing edits
    - Files providing needed provide the required edits

<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel. Prioritize calling tools simultaneously whenever the actions can be done in parallel rather than sequentially. For example, when reading 3 files, run 3 tool calls in parallel to read all 3 files into context at the same time. Maximize use of parallel tool calls where possible to increase speed and efficiency. However, if some tool calls depend on previous calls to inform dependent values like the parameters, do NOT call these tools in parallel and instead call them sequentially. Never use placeholders or guess missing parameters in tool calls.

Parallel tool calls can be made using the following schema:

<tool_call>
<function=example_function_name_1>
<parameter=example_parameter_1>
value_1
</parameter>
<parameter=example_parameter_2>
</parameter>
</function>

<function=example_function_name_2>
<parameter=example_parameter_1>
value_1
</parameter>
<parameter=example_parameter_2>
</parameter>
</function>
</tool_call>

Where you can place as many <function=...>...</function> tags as you want within the <tool_call>...</tool_calls> tags for parallel tool calls.
</use_parallel_tool_calls>
```

Replace `{{prompt}}` with the actual user query (e.g., "Where is the authentication logic implemented?") and `{{repo_root}}` with the root of the file directory where the codebase is located.

## Tool Schema Definition

Below are the individual tool schema definitions that you can use in your OpenAI-compatible implementation.

<CodeGroup>
  ```json View File theme={null}
  {
    "type": "function",
    "function": {
      "name": "view_file",
      "strict": true,
      "description": "Tool for viewing/exploring the contents of existing files\n\nLine numbers are included in the output, indexing at 1. If the output does not include the end of the file, it will be noted after the final output line.\n\nExample (viewing the first 2 lines of a file):\n1   def my_function():\n2       print(\"Hello, World!\")\n... rest of file truncated ...",
      "parameters": {
        "type": "object",
        "required": ["path", "view_range"],
        "properties": {
          "path": {
            "type": "string",
            "description": "Absolute path to a file, e.g. `/repo/file.py`."
          },
          "view_range": {
            "type": "array",
            "items": {
              "type": "integer"
            },
            "default": [1, 100],
            "description": "Range of file lines to view. If not specified, the first 100 lines of the file are shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file."
          }
        },
        "additionalProperties": false
      }
    }
  }
  ```

  ```json View Directory theme={null}
  {
    "type": "function",
    "function": {
      "name": "view_directory",
      "strict": true,
      "description": "Tool for viewing the contents of a directory.\n\n* Lists contents recursively, relative to the input directory\n* Directories are suffixed with a trailing slash '/'\n* Depth might be limited by the tool implementation\n* Output is limited to the first 250 items\n\nExample output:\nfile1.txt\nfile2.txt\nsubdir1/\nsubdir1/file3.txt",
      "parameters": {
        "type": "object",
        "required": ["path", "include_hidden"],
        "properties": {
          "path": {
            "type": "string",
            "description": "Absolute path to a directory, e.g. `/repo/`."
          },
          "include_hidden": {
            "type": "boolean",
            "default": false,
            "description": "If true, include hidden files in the output (false by default)."
          }
        },
        "additionalProperties": false
      }
    }
  }
  ```

  ```json Grep Search theme={null}
  {
    "type": "function",
    "function": {
      "name": "grep_search",
      "strict": true,
      "description": "Fast text-based regex search that finds exact pattern matches within files or directories, utilizing the ripgrep command for efficient searching. Results will be formatted in the style of ripgrep and can be configured to include line numbers and content. To avoid overwhelming output, the results are capped at 50 matches. Use the include or exclude patterns to filter the search scope by file type or specific paths. This is best for finding exact text matches or regex patterns.",
      "parameters": {
        "type": "object",
        "required": [
          "query",
          "case_sensitive",
          "exclude_pattern",
          "include_pattern"
        ],
        "properties": {
          "query": {
            "type": "string",
            "description": "The regex pattern to search for"
          },
          "case_sensitive": {
            "type": "boolean",
            "default": true,
            "description": "Whether the search should be case sensitive"
          },
          "exclude_pattern": {
            "type": ["string", "null"],
            "description": "Glob pattern for files to exclude"
          },
          "include_pattern": {
            "type": ["string", "null"],
            "description": "Glob pattern for files to include (e.g. '*.ts' for TypeScript files)"
          }
        },
        "additionalProperties": false
      }
    }
  }
  ```

  ```json Bash theme={null}
  {
    "type": "function",
    "function": {
      "name": "bash",
      "strict": true,
      "description": "Tool for executing bash commands.\n\n* Avoid long running commands\n* Avoid dangerous/destructive commands\n* Prefer using other more specialized tools where possible",
      "parameters": {
        "type": "object",
        "required": ["command"],
        "properties": {
          "command": {
            "type": "string",
            "description": "Bash command to execute"
          }
        },
        "additionalProperties": false
      }
    }
  }
  ```

  ```json Report Back theme={null}
  {
    "type": "function",
    "function": {
      "name": "report_back",
      "strict": true,
      "description": "This is a tool to use when you feel like you have finished exploring the codebase and understanding the problem, and now would like to report back to the user.",
      "parameters": {
        "type": "object",
        "required": ["explanation", "files"],
        "properties": {
          "explanation": {
            "type": "string",
            "description": "Details your reasoning for deeming the files relevant for solving the issue."
          },
          "files": {
            "type": "object",
            "additionalProperties": {
              "type": "array",
              "items": {
                "type": "array",
                "minItems": 2,
                "maxItems": 2,
                "prefixItems": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "integer"
                  }
                ]
              }
            },
            "description": "A dictionary where the keys are file paths and the values are lists of tuples representing the line ranges in each file that are relevant to solving the issue."
          }
        },
        "additionalProperties": false
      }
    }
  }
  ```
</CodeGroup>

### Code Example with OpenAI SDK

Here's the basic setup showing how to configure the agent with the tools.

```typescript Expandable theme={null}
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.RELACE_API_KEY,
  baseUrl: 'https://search.endpoint.relace.run/v1/search',
});

const tools = [
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
          path: {
            type: 'string',
            description: 'Absolute path to a file, e.g. `/repo/file.py`.',
          },
          view_range: {
            type: 'array',
            items: {
              type: 'integer',
            },
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
          path: {
            type: 'string',
            description: 'Absolute path to a directory, e.g. `/repo/`.',
          },
          include_hidden: {
            type: 'boolean',
            default: false,
            description:
              'If true, include hidden files in the output (false by default).',
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
        required: [
          'query',
          'case_sensitive',
          'exclude_pattern',
          'include_pattern',
        ],
        properties: {
          query: {
            type: 'string',
            description: 'The regex pattern to search for',
          },
          case_sensitive: {
            type: 'boolean',
            default: true,
            description: 'Whether the search should be case sensitive',
          },
          exclude_pattern: {
            type: ['string', 'null'],
            description: 'Glob pattern for files to exclude',
          },
          include_pattern: {
            type: ['string', 'null'],
            description:
              "Glob pattern for files to include (e.g. '*.ts' for TypeScript files)",
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
        properties: {
          command: {
            type: 'string',
            description: 'Bash command to execute',
          },
        },
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
          explanation: {
            type: 'string',
            description:
              'Details your reasoning for deeming the files relevant for solving the issue.',
          },
          files: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                prefixItems: [
                  {
                    type: 'integer',
                  },
                  {
                    type: 'integer',
                  },
                ],
              },
            },
            description:
              'A dictionary where the keys are file paths and the values are lists of tuples representing the line ranges in each file that are relevant to solving the issue.',
          },
        },
        additionalProperties: false,
      },
    },
  },
];

const systemPrompt = `You are an AI agent whose job is to explore a code base with the provided tools and thoroughly understand the problem. You should use the tools provided to explore the codebase, read files, search for specific terms, and execute bash commands as needed. Once you have a good understanding of the problem, use the \`report_back\` tool share your findings. Make sure to only use the \`report_back\` tool when you are confident that you have gathered enough information to make an informed decision. Your objective is speed and efficiency so call multiple tools at once where applicable to reduce latency and reduce the number of turns. You are given a limited number of turns so aim to call 4-12 tools in parallel. You are suggested to explain your reasoning for the tools you choose to call before calling them.`;

const userQuery = 'How is user authentication handled in this codebase?';

const response = await client.chat.completions.create({
  model: 'relace-search',
  messages: [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: `I have uploaded a code repository in the /repo directory.

Now consider the following user query:

<user_query>
${userQuery}
</user_query>

You need to resolve the <user_query>.

To do this, follow the workflow below:

---

Your job is purely to understand the codebase.

### 1. Explore and Understand the Codebase

You **must first build a deep understanding of the relevant code**.

Use the available tools to:

- Locate and examine all relevant parts of the codebase.
- Understand how the current code works, including expected behaviors, control flow, and edge cases.
- Identify the potential root cause(s) of the issue or the entry points for the requested feature.
- Review any related unit tests to understand expected behavior.

---

### 2. Report Back Your Understanding

Once you believe you have a solid understanding of the issue and the relevant code:

- Use the \`report_back\` tool to report you findings.
  - File paths should be relative to the project root excluding the base \`/repo/\` failure to comply will result in deductions.
  - Only report the relevant files within the repository. You may speculate that a file or folder may be added in your explaination, but it must not be put within you reported files.

---

### Success Criteria

A successful resolution means:

- The specific issue in the <user_query> is well understood.
- Your explain clearly the reasoning behind marking code as relavent.
- The files comprehensively covers all the key files needed to address the query.
  - Relevant files can be any of three types:
    - Files needing edits
    - Files providing needed provide the required edits

<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel. Prioritize calling tools simultaneously whenever the actions can be done in parallel rather than sequentially. For example, when reading 3 files, run 3 tool calls in parallel to read all 3 files into context at the same time. Maximize use of parallel tool calls where possible to increase speed and efficiency. However, if some tool calls depend on previous calls to inform dependent values like the parameters, do NOT call these tools in parallel and instead call them sequentially. Never use placeholders or guess missing parameters in tool calls.

Parallel tool calls can be made using the following schema:

<tool_call>
<function=example_function_name_1>
<parameter=example_parameter_1>
value_1
</parameter>
<parameter=example_parameter_2>
</parameter>
</function>

<function=example_function_name_2>
<parameter=example_parameter_1>
value_1
</parameter>
<parameter=example_parameter_2>
</parameter>
</function>
</tool_call>

Where you can place as many <function=...>...</function> tags as you want within the <tool_call>...</tool_calls> tags for parallel tool calls.
</use_parallel_tool_calls>`,
    },
  ],
  tools: tools,
  tool_choice: 'auto',
  temperature: 1.0,
  top_k: 100,
  top_p: 0.95,
  repetition_penalty: 1.0,
});

console.log(response);
```

## Tool Implementations

You must also implement the actual execution logic on your backend for each of the tools defined above. Here are some example implementations:

<CodeGroup>
  ```typescript View File theme={null}
  // Tool handler for viewing file contents
  const viewFileHandler = ({
    path,
    view_range,
  }: {
    path: string;
    view_range: [number, number];
  }) => {
    try {
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n');
      const [start, end] = view_range;
      const endLine = end === -1 ? lines.length : end;

      const result = lines
        .slice(start - 1, endLine)
        .map((line, idx) => `${start + idx}   ${line}`)
        .join('\n');

      if (endLine < lines.length) {
        return result + '\n... rest of file truncated ...';
      }
      return result;
    } catch (error) {
      return `Error reading file: ${error.message}`;
    }
  };
  ```

  ```typescript View Directory theme={null}
  // Tool handler for viewing directory contents
  const viewDirectoryHandler = ({
    path,
    include_hidden,
  }: {
    path: string;
    include_hidden: boolean;
  }) => {
    try {
      const options = include_hidden ? '-a' : '';
      const output = execSync(`find ${path} -type f ${options} | head -250`, {
        encoding: 'utf-8',
      });
      return output;
    } catch (error) {
      return `Error listing directory: ${error.message}`;
    }
  };
  ```

  ```typescript Grep Search theme={null}
  // Tool handler for grep search
  const grepSearchHandler = ({
    query,
    case_sensitive,
    exclude_pattern,
    include_pattern,
  }: {
    query: string;
    case_sensitive: boolean;
    exclude_pattern: string | null;
    include_pattern: string | null;
  }) => {
    try {
      const caseFlag = case_sensitive ? '' : '-i';
      const excludeFlag = exclude_pattern ? `--glob "!${exclude_pattern}"` : '';
      const includeFlag = include_pattern ? `--glob "${include_pattern}"` : '';

      const output = execSync(
        `rg ${caseFlag} ${excludeFlag} ${includeFlag} "${query}" /repo | head -50`,
        { encoding: 'utf-8' }
      );
      return output;
    } catch (error) {
      return `No matches found or error: ${error.message}`;
    }
  };
  ```

  ```typescript Bash theme={null}
  // Tool handler for bash commands
  const bashHandler = ({ command }: { command: string }) => {
    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 5000, // 5 second timeout for safety
      });
      return output;
    } catch (error) {
      return `Error executing command: ${error.message}`;
    }
  };
  ```

  ```typescript Report Back theme={null}
  // Tool handler for reporting back findings
  const reportBackHandler = ({
    explanation,
    files,
  }: {
    explanation: string;
    files: Record<string, [number, number][]>;
  }) => {
    // This is the final tool call - return the findings
    return {
      explanation,
      files,
    };
  };
  ```
</CodeGroup>

### Parallel Tool Calling

The agent harness must support parallel tool execution to achieve optimal performance.

Since each tool call can take up to \~1-2 seconds depending on the repository size, and the model typically makes 4-12 tool calls per turn, parallel execution provides substantial speed improvements—potentially reducing response times from 12-24 seconds down to 1-2 seconds per turn.

## Relace Repos

The agent harness within Relace Repos is specifically optimized for Fast Agentic Search performance.

You can run it on any Relace Repo with:

```typescript  theme={null}
import { Relace } from '@relace-ai/relace';

const client = new Relace({ apiKey: 'YOUR_API_KEY' });

const result = await client.repo.search(repoId, {
  query: 'How is user authentication handled?',
});
```

To reduce overhead, we:

* Optimized file system operations on large repositories
* Overlapped sandbox creation with the first generation turn
* Co-locate sandboxes, repos, and agent runtime container to minimize network I/O latency


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.relace.ai/llms.txt
