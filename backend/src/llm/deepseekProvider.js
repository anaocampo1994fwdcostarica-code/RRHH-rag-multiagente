// Proveedor LLM de DeepSeek (API compatible con OpenAI). Misma interfaz que geminiProvider:
//   generate(prompt) → texto
//   generateJson(prompt, { schema, systemInstruction, signal }) → texto JSON (el llamador lo valida)
// Documentación consultada (2026-11-19): https://api-docs.deepseek.com/ y /guides/json_mode
//   - Modelo vigente: deepseek-flash. JSON Output con response_format { type: 'json_object' };
//     exige la palabra "json" en el prompt y puede devolver contenido vacío: se reintenta una vez.
// La clave nunca se registra ni aparece en los errores.

const BASE_URL = 'https://api.deepseek.com'
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504])

export class LlmProviderError extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'LlmProviderError'
    this.status = status
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new LlmProviderError('DeepSeek request aborted.')) }, { once: true })
})

export function createDeepseekProvider({
  apiKey = process.env.DEEPSEEK_API_KEY,
  model = process.env.DEEPSEEK_MODEL ?? 'deepseek-flash',
  timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 6000),
  maxRetries = 2,
  baseDelayMs = 300,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function complete(messages, { json = false, signal, maxTokens = json ? 400 : 800 } = {}) {
    if (!apiKey) throw new LlmProviderError('DeepSeek is not configured.')
    // Un único plazo total para la llamada y sus reintentos; el llamador puede abortar antes.
    const deadline = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    let lastError
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1), combined)
      let response
      try {
        response = await fetchImpl(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens, stream: false, ...(json && { response_format: { type: 'json_object' } }) }),
          signal: combined,
        })
      } catch {
        if (combined.aborted) throw new LlmProviderError('DeepSeek request timed out or was aborted.')
        lastError = new LlmProviderError('DeepSeek network error.')
        continue
      }
      if (!response.ok) {
        lastError = new LlmProviderError(`DeepSeek request failed with HTTP ${response.status}.`, { status: response.status })
        if (RETRYABLE.has(response.status)) continue
        throw lastError
      }
      const body = await response.json().catch(() => null)
      const content = body?.choices?.[0]?.message?.content?.trim() ?? ''
      // JSON Output puede devolver solo espacios aunque finish_reason sea "stop": se reintenta.
      if (json && !content) { lastError = new LlmProviderError('DeepSeek returned empty JSON content.'); continue }
      return content
    }
    throw lastError ?? new LlmProviderError('DeepSeek request failed.')
  }

  return {
    name: 'deepseek',
    model,
    async generate(prompt) {
      return complete([{ role: 'user', content: prompt }])
    },
    async generateJson(prompt, { schema, systemInstruction, signal } = {}) {
      // DeepSeek no acepta un JSON Schema: se describe en el prompt de sistema (que debe mencionar "json").
      const system = [
        systemInstruction,
        'Responde únicamente con un objeto json válido, sin texto adicional ni bloques de código.',
        schema && `El json debe cumplir este JSON Schema:\n${JSON.stringify(schema)}`,
      ].filter(Boolean).join('\n\n')
      return complete([{ role: 'system', content: system }, { role: 'user', content: prompt }], { json: true, signal })
    },
  }
}
