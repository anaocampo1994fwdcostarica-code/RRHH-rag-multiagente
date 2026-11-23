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

// Umbral de similitud coseno para match_policy_chunks por modelo de embeddings. E5 local calibrado el 2026-11-21
// (npm run calibrate:threshold, docs/evidencias/calibracion_umbral_2026-11-21.md): peor política 0.848, bono por
// mascotas 0.807, punto medio 0.828. Los demás siguen provisionales. OpenAI text-embedding-3-small puntúa bajo (pares relacionados ≈ 0.5–0.7,
// sin relación ≈ 0.2–0.4): 0.45. E5 puntúa alto aun sin relación. Gemini: 0.7.
// Debe declararse antes de env: parseThreshold lo usa al construir env.
export const DEFAULT_SIMILARITY_THRESHOLDS = Object.freeze({ openai: 0.45, local: 0.828, gemini: 0.7 })

export const env = {
  port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3001,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabaseUrl: optionalValue('SUPABASE_URL'),
  supabasePublishableKey: optionalValue('SUPABASE_PUBLISHABLE_KEY'),
  databaseUrl: optionalValue('DATABASE_URL'),
  databaseSslCaFile: optionalValue('DATABASE_SSL_CA_FILE'),
  llmProvider: optionalValue('LLM_PROVIDER') ?? 'deepseek',
  embeddingsProvider: optionalValue('EMBEDDINGS_PROVIDER') ?? 'local',
  ragSimilarityThreshold: parseThreshold(optionalValue('RAG_SIMILARITY_THRESHOLD'), optionalValue('EMBEDDINGS_PROVIDER') ?? 'local'),
}

function parseThreshold(value, embeddingsProvider) {
  if (value === undefined) return DEFAULT_SIMILARITY_THRESHOLDS[embeddingsProvider] ?? 0.7
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
