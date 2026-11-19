import app from './src/app.js'
import { env } from './src/config/env.js'
import { getEmbeddingProvider } from './src/llm/providers.js'

const server = app.listen(env.port, () => {
  console.log(`RRHH RAG backend listening on port ${env.port}`)
})

// Precarga el modelo de embeddings local para no sumar latencia a la primera consulta.
// No bloquea el arranque: si falla, el agente de políticas lo reintenta al primer uso.
const embeddings = getEmbeddingProvider()
if (typeof embeddings.preload === 'function') {
  const started = Date.now()
  embeddings.preload()
    .then(() => console.log(`Embedding model ready (${embeddings.model}) in ${Date.now() - started} ms`))
    .catch((error) => console.error(`Embedding model preload failed: ${error.message}`))
}

function shutdown(signal) {
  console.log(`${signal} received. Closing server.`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
