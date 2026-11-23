import { GoogleGenAI } from '@google/genai'

const chatModel = () => process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash'

export function createGeminiProvider({ apiKey = process.env.GEMINI_API_KEY, createClient = (key) => new GoogleGenAI({ apiKey: key }) } = {}) {
  let client
  const get = () => { if (!apiKey) throw new Error('Gemini is not configured.'); return client ??= createClient(apiKey) }
  return {
    async embed(text, taskType = 'RETRIEVAL_QUERY') { const r = await get().models.embedContent({ model: 'gemini-embedding-001', contents: text, config: { outputDimensionality: 768, taskType } }); const values = r.embeddings?.[0]?.values; if (!Array.isArray(values) || values.length !== 768 || values.some((v) => !Number.isFinite(v))) throw new Error('Invalid Gemini embedding response.'); return values },
    async generate(prompt) { const r = await get().models.generateContent({ model: chatModel(), contents: prompt }); return r.text?.trim() || '' },
    // Salida estructurada: el modelo debe devolver JSON que cumpla `schema` (JSON Schema).
    // Temperatura 0 y sin "thinking" para que la clasificación sea estable y rápida (< 8 s por consulta).
    async generateJson(prompt, { schema, systemInstruction, signal } = {}) {
      const r = await get().models.generateContent({
        model: process.env.GEMINI_CLASSIFIER_MODEL ?? chatModel(),
        contents: prompt,
        config: { systemInstruction, responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0, thinkingConfig: { thinkingBudget: 0 }, abortSignal: signal },
      })
      return r.text?.trim() || ''
    },
  }
}
