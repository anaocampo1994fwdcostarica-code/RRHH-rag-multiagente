import app from './src/app.js'
import { env } from './src/config/env.js'

const server = app.listen(env.port, () => {
  console.log(`RRHH RAG backend listening on port ${env.port}`)
})

function shutdown(signal) {
  console.log(`${signal} received. Closing server.`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
