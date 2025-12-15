import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getLLMProviderByModel } from './appData.js'

const OPENROUTER_BASE_ENDPOINT = 'https://openrouter.ai/api/v1'

function isOpenRouterEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname === 'openrouter.ai'
  } catch {
    return false
  }
}

async function readKeyFromDotfile() {
  const keyPath = path.join(process.cwd(), '.llmkey')
  const key = (await readFile(keyPath, 'utf-8')).trim()
  if (!key) throw new Error('Empty .llmkey')
  return key
}

export async function runOpenRouterChat(args: {
  model: string
  systemPrompt: string
  userPrompt: string
}) {
  // Try to get provider config from settings first
  const providerConfig = await getLLMProviderByModel(args.model)
  
  let endpoint: string
  let apiKey: string
  let modelId: string
  
  if (providerConfig) {
    // Use provider config from settings
    endpoint = providerConfig.endpoint
    apiKey = providerConfig.apiKey
    modelId = args.model
  } else {
    // Fall back to OpenRouter with .llmkey file
    endpoint = OPENROUTER_BASE_ENDPOINT
    apiKey = await readKeyFromDotfile()
    modelId = args.model
  }

  // Ensure endpoint ends with /chat/completions for OpenAI-compatible APIs
  const chatEndpoint = endpoint.endsWith('/chat/completions')
    ? endpoint
    : endpoint.replace(/\/?$/, '/chat/completions')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // Add OpenRouter-specific headers only for OpenRouter
  if (isOpenRouterEndpoint(endpoint)) {
    headers['HTTP-Referer'] = 'http://localhost:5173'
    headers['X-Title'] = 'SpecFlow'
  }

  const res = await fetch(chatEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`LLM API error: ${JSON.stringify(data)}`)
  }

  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`Unexpected LLM API response: ${JSON.stringify(data)}`)
  }
  return content
}
