import { isVerifiedAuthIdentity } from '../security/authIdentity.js'
import { getPostgresPool } from '../services/postgresPool.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Registro de consultas del chat en public.chat_query_logs.
// Se ejecuta con el login rrhh_api SIN "SET ROLE authenticated": app_private.log_chat_query solo la
// puede ejecutar rrhh_api, así que ningún usuario puede falsear el registro con su JWT.
// profileId debe venir de una identidad verificada por requireAuth.
export function createChatQueryLogRepository({ getPool = getPostgresPool } = {}) {
  return {
    async record(entry, { auth } = {}) {
      if (!isVerifiedAuthIdentity(auth) || auth.userId !== entry?.userId || !uuidPattern.test(entry.userId)) {
        throw new TypeError('Chat query log requires a verified profile id.')
      }
      const pool = await getPool()
      await pool.query(
        'select app_private.log_chat_query($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)',
        [
          entry.userId,
          entry.question,
          entry.intent,
          entry.agent ?? null,
          JSON.stringify(Array.isArray(entry.citedDocuments) ? entry.citedDocuments : []),
          entry.resolved === true,
          entry.escalated === true,
          Math.max(0, Math.round(entry.latencyMs ?? 0)),
          entry.promptVersion ?? null,
        ],
      )
    },
  }
}
