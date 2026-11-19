import { env } from '../config/env.js'
import { createGeminiProvider } from '../rag/geminiProvider.js'
import { createLocalEmbeddingProvider } from '../rag/localEmbeddingProvider.js'
import { createDeepseekProvider } from './deepseekProvider.js'
import { createOpenAiEmbeddingProvider, createOpenAiProvider } from './openaiProvider.js'

// Selección de proveedores por variables de entorno:
//   LLM_PROVIDER        = openai (por defecto) | deepseek | gemini
//   EMBEDDINGS_PROVIDER = openai (por defecto) | local (E5) | gemini
// DeepSeek, Gemini y E5 local se conservan como alternativas.

let sharedLlm
let sharedEmbeddings

export function createLlmProvider(provider = env.llmProvider) {
  if (provider === 'openai') return createOpenAiProvider()
  if (provider === 'deepseek') return createDeepseekProvider()
  if (provider === 'gemini') return createGeminiProvider()
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
}

export function createEmbeddingProvider(provider = env.embeddingsProvider) {
  if (provider === 'openai') return createOpenAiEmbeddingProvider()
  if (provider === 'local') return createLocalEmbeddingProvider()
  if (provider === 'gemini') return createGeminiProvider()
  throw new Error(`Unsupported EMBEDDINGS_PROVIDER: ${provider}`)
}

export const getLlmProvider = () => (sharedLlm ??= createLlmProvider())
export const getEmbeddingProvider = () => (sharedEmbeddings ??= createEmbeddingProvider())
