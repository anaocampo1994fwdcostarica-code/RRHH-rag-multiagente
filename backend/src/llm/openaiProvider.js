// Proveedores de OpenAI con fetch nativo contra https://api.openai.com/v1.
//   createOpenAiProvider()          → generate / generateJson (Chat Completions)
//   createOpenAiEmbeddingProvider() → embed (text-embedding-3-small con dimensions = 768)
// Documentación consultada (2026-11-19, developers.openai.com/api/docs):
//   - Modelo eficiente recomendado: gpt-6-luna (Chat Completions y Structured Outputs; razonamiento con
//     reasoning_effort, que admite "none" para menor latencia).
//   - Structured Outputs: response_format { type: 'json_schema', json_schema: { name, strict: true, schema } };
//     en modo estricto: additionalProperties false, todas las propiedades en required y opcionales como null.
//     Una negativa llega en message.refusal y no sigue el esquema.
//   - Embeddings: text-embedding-3-small admite el parámetro dimensions; los vectores salen normalizados.
// Plazo total por llamada, reintentos con espera ante 429/5xx y la clave nunca aparece en errores ni registros.

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504])
export const OPENAI_EMBEDDING_DIMENSIONS = 768

export class OpenAiProviderError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'OpenAiProviderError'
    this.status = status
    this.code = code
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new OpenAiProviderError('OpenAI request aborted.')) }, { once: true })
})

/** Contador de uso de tokens (para estimar el costo en evaluaciones). */
export function createUsageMeter() {
  const totals = { requests: 0, promptTokens: 0, completionTokens: 0, embeddingTokens: 0 }
  return {
    totals,
    addChat(usage) { totals.requests += 1; totals.promptTokens += usage?.prompt_tokens ?? 0; totals.completionTokens += usage?.completion_tokens ?? 0 },
    addEmbedding(usage) { totals.requests += 1; totals.embeddingTokens += usage?.prompt_tokens ?? usage?.total_tokens ?? 0 },
  }
}

function createClient({ apiKey, baseUrl, timeoutMs, maxRetries, baseDelayMs, fetchImpl }) {
  const endpoint = String(baseUrl).replace(/\/+$/, '')
  return async function post(path, body, { signal } = {}) {
    if (!apiKey) throw new OpenAiProviderError('OpenAI is not configured.')
    const deadline = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    let lastError
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1), combined)
      let response
      try {
        response = await fetchImpl(`${endpoint}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: combined,
        })
      } catch {
        if (combined.aborted) throw new OpenAiProviderError('OpenAI request timed out or was aborted.')
        lastError = new OpenAiProviderError('OpenAI network error.')
        continue
      }
      if (!response.ok) {
        // Solo el código de error de OpenAI (p. ej. invalid_api_key); nunca el mensaje, que puede citar la clave.
        const code = await response.json().then((data) => data?.error?.code ?? null, () => null)
        lastError = new OpenAiProviderError(`OpenAI request failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`, { status: response.status, code })
        if (RETRYABLE.has(response.status)) continue
        throw lastError
      }
      return response.json()
    }
    throw lastError ?? new OpenAiProviderError('OpenAI request failed.')
  }
}

/**
 * Convierte un JSON Schema de la app al modo estricto de Structured Outputs:
 * objetos con additionalProperties false y todas sus propiedades en required; las propiedades que no eran
 * obligatorias aceptan null (los objetos anidados se mantienen obligatorios y no nulos).
 */
export function toStrictSchema(schema) {
  if (schema?.type !== 'object') return schema
  const originalRequired = new Set(schema.required ?? [])
  const properties = {}
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    const strict = toStrictSchema(value)
    const nullable = !originalRequired.has(key) && strict.type !== 'object'
    properties[key] = nullable
      ? { ...strict, type: [strict.type, 'null'], ...(strict.enum && { enum: [...strict.enum, null] }) }
      : strict
  }
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

export function createOpenAiProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || 'gpt-6-luna',
  reasoningEffort = process.env.OPENAI_REASONING_EFFORT || 'none',
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 6000),
  maxRetries = 2,
  baseDelayMs = 300,
  fetchImpl = (...args) => globalThis.fetch(...args),
  usage = createUsageMeter(),
} = {}) {
  const post = createClient({ apiKey, baseUrl, timeoutMs, maxRetries, baseDelayMs, fetchImpl })

  async function chat(messages, { responseFormat, signal, maxTokens = 600 } = {}) {
    const body = await post('/chat/completions', {
      model,
      messages,
      max_completion_tokens: maxTokens,
      ...(reasoningEffort && { reasoning_effort: reasoningEffort }),
      ...(responseFormat && { response_format: responseFormat }),
    }, { signal })
    usage.addChat(body?.usage)
    const message = body?.choices?.[0]?.message
    if (message?.refusal) throw new OpenAiProviderError('OpenAI refused to answer.', { code: 'refusal' })
    return message?.content?.trim() ?? ''
  }

  return {
    name: 'openai',
    model,
    usage: usage.totals,
    async generate(prompt) {
      return chat([{ role: 'user', content: prompt }], { maxTokens: 800 })
    },
    async generateJson(prompt, { schema, systemInstruction, signal } = {}) {
      const messages = [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt },
      ]
      // Structured Outputs con JSON Schema estricto; sin esquema, JSON mode.
      const responseFormat = schema
        ? { type: 'json_schema', json_schema: { name: 'respuesta', strict: true, schema: toStrictSchema(schema) } }
        : { type: 'json_object' }
      return chat(messages, { responseFormat, signal, maxTokens: 400 })
    },
  }
}

export function createOpenAiEmbeddingProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  dimensions = OPENAI_EMBEDDING_DIMENSIONS,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 6000),
  maxRetries = 2,
  baseDelayMs = 300,
  fetchImpl = (...args) => globalThis.fetch(...args),
  usage = createUsageMeter(),
} = {}) {
  const post = createClient({ apiKey, baseUrl, timeoutMs, maxRetries, baseDelayMs, fetchImpl })
  return {
    name: 'openai-embeddings',
    model,
    usage: usage.totals,
    // taskType se ignora: los embeddings de OpenAI no usan prefijos de tarea.
    async embed(text) {
      const body = await post('/embeddings', { model, input: String(text ?? ''), dimensions, encoding_format: 'float' })
      usage.addEmbedding(body?.usage)
      const values = body?.data?.[0]?.embedding
      if (!Array.isArray(values) || values.length !== dimensions || values.some((value) => !Number.isFinite(value))) {
        throw new OpenAiProviderError('Invalid OpenAI embedding response.')
      }
      // Normalización L2 explícita (el producto punto equivale a coseno, como espera pgvector <=>).
      const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1
      return values.map((value) => value / norm)
    },
  }
}
