import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const parsedPort = Number.parseInt(process.env.PORT ?? '3001', 10)

function optionalValue(name) {
  const value = process.env[name]?.trim()
  return value || undefined
}

function requiredValue(name) {
  const value = optionalValue(name)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function requireUrl(name, allowedProtocols) {
  const value = requiredValue(name)

  try {
    const url = new URL(value)
    if (!allowedProtocols.includes(url.protocol)) throw new Error('unsupported protocol')
    return value
  } catch {
    throw new Error(`${name} must be a valid URL with an allowed protocol.`)
  }
}

export const env = {
  port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3001,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabaseUrl: optionalValue('SUPABASE_URL'),
  supabasePublishableKey: optionalValue('SUPABASE_PUBLISHABLE_KEY'),
  databaseUrl: optionalValue('DATABASE_URL'),
  databaseSslCaFile: optionalValue('DATABASE_SSL_CA_FILE'),
  llmProvider: optionalValue('LLM_PROVIDER') ?? 'deepseek',
  embeddingsProvider: optionalValue('EMBEDDINGS_PROVIDER') ?? 'local',
  ragSimilarityThreshold: parseThreshold(optionalValue('RAG_SIMILARITY_THRESHOLD')),
}

// Umbral de similitud coseno para match_policy_chunks. Con E5 los puntajes suelen ser altos aun sin
// relación (≈ 0.75–0.80), por eso el valor inicial es 0.82; se calibra con el banco de preguntas.
function parseThreshold(value) {
  if (value === undefined) return 0.82
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error('RAG_SIMILARITY_THRESHOLD must be a number between 0 and 1.')
  return parsed
}

// These are intentionally deferred. Health checks must work before integrations
// are configured; future auth and database modules opt in explicitly.
export function getSupabaseAuthConfig() {
  return {
    url: requireUrl('SUPABASE_URL', ['https:']),
    publishableKey: requiredValue('SUPABASE_PUBLISHABLE_KEY'),
  }
}

export function getDatabaseConfig() {
  return {
    url: requireUrl('DATABASE_URL', ['postgres:', 'postgresql:']),
    sslCaFile: requiredValue('DATABASE_SSL_CA_FILE'),
  }
}
