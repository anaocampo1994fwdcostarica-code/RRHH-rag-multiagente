import app from './src/app.js'
import { env } from './src/config/env.js'
import { getEmbeddingProvider } from './src/llm/providers.js'

// En Express 5, app.listen también invoca el callback con el error; el error se reporta abajo.
const server = app.listen(env.port, (error) => {
  if (error) return
  console.log(`RRHH RAG backend listening on port ${env.port}`)
})

// Puerto ocupado: mensaje claro con la forma de liberarlo, en lugar de una traza de EADDRINUSE.
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error([
      `ERROR: el puerto ${env.port} ya está en uso (probablemente otra instancia del backend sigue corriendo).`,
      'Libéralo y vuelve a intentar. En Windows:',
      `  netstat -ano | findstr :${env.port}`,
      '  taskkill /PID <pid> /F',
      'O usa otro puerto con PORT en backend/.env (y ajusta VITE_API_BASE_URL en frontend/.env).',
    ].join('\n'))
    process.exitCode = 1
    return
  }
  throw error
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
