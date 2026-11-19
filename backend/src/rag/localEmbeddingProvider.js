// Embeddings locales con un modelo abierto: Xenova/multilingual-e5-base (768 dimensiones, como vector(768)).
// - E5 exige prefijos: "query: " para preguntas y "passage: " para fragmentos indexados.
// - Mean pooling + normalización L2: el producto punto equivale a similitud coseno (operador <=> de pgvector).
// - El modelo se carga una sola vez (singleton por proceso) y puede precargarse al iniciar el backend.

export const LOCAL_EMBEDDING_MODEL = 'Xenova/multilingual-e5-base'
export const EMBEDDING_DIMENSIONS = 768
const DOCUMENT_TASKS = new Set(['RETRIEVAL_DOCUMENT', 'passage', 'document'])

let sharedExtractor

async function defaultLoadPipeline(model) {
  const { pipeline } = await import('@huggingface/transformers')
  return pipeline('feature-extraction', model)
}

export function e5Input(text, taskType) {
  return `${DOCUMENT_TASKS.has(taskType) ? 'passage' : 'query'}: ${String(text ?? '').trim()}`
}

export function createLocalEmbeddingProvider({ model = LOCAL_EMBEDDING_MODEL, loadPipeline = defaultLoadPipeline, shared = true } = {}) {
  let ownExtractor
  const getExtractor = () => {
    if (shared) return (sharedExtractor ??= loadPipeline(model).catch((error) => { sharedExtractor = undefined; throw error }))
    return (ownExtractor ??= loadPipeline(model))
  }

  return {
    name: 'local-e5',
    model,
    async preload() {
      await getExtractor()
    },
    async embed(text, taskType = 'RETRIEVAL_QUERY') {
      const extractor = await getExtractor()
      const output = await extractor(e5Input(text, taskType), { pooling: 'mean', normalize: true })
      const values = Array.from(output.data)
      if (values.length !== EMBEDDING_DIMENSIONS || values.some((value) => !Number.isFinite(value))) throw new Error('Invalid local embedding response.')
      return values
    },
  }
}

/** Similitud coseno entre vectores normalizados (producto punto). */
export function cosineSimilarity(a, b) {
  let dot = 0
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index]
  return dot
}
