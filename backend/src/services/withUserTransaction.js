import { isVerifiedAuthIdentity } from '../security/authIdentity.js'
import { getPostgresPool } from './postgresPool.js'

const forbiddenQueryPattern = /^\s*(begin|commit|rollback|savepoint|release|set|reset|discard|start\s+transaction|prepare\s+transaction|deallocate|listen|unlisten|notify)\b/i

function createUserQueryClient(client) {
  return Object.freeze({
    async query(text, values = []) {
      if (typeof text !== 'string' || !text.trim() || forbiddenQueryPattern.test(text) || text.includes(';')) {
        throw new Error('Transaction control and session configuration are managed by the RLS transaction wrapper.')
      }
      if (!Array.isArray(values)) {
        throw new TypeError('Query values must be an array.')
      }

      return client.query(text, values)
    },
  })
}

export const TRANSACTION_SETUP_SQL = "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('role', 'authenticated', true)"

function createRlsClaims(auth) {
  return JSON.stringify({
    sub: auth.userId,
    role: 'authenticated',
    aud: 'authenticated',
  })
}

export async function withUserTransaction(auth, callback, { getPool = getPostgresPool, completion = 'commit' } = {}) {
  if (!isVerifiedAuthIdentity(auth)) {
    throw new TypeError('withUserTransaction requires an identity created by requireAuth.')
  }
  if (typeof callback !== 'function') {
    throw new TypeError('withUserTransaction requires a callback function.')
  }
  if (!['commit', 'rollback'].includes(completion)) {
    throw new TypeError('Transaction completion must be commit or rollback.')
  }

  const pool = await getPool()
  let client
  let transactionStarted = false
  let transactionFinished = false

  try {
    client = await pool.connect()
    await client.query('BEGIN')
    transactionStarted = true

    // Una sola ida a la base: claims, sub y rol local (set_config('role', …, true) equivale a SET LOCAL ROLE y
    // verifica la pertenencia igual). Antes eran 3 viajes; con ~0,3 s de latencia de red por viaje, era ~1 s por consulta.
    await client.query(TRANSACTION_SETUP_SQL, [createRlsClaims(auth), auth.userId])

    const result = await callback(createUserQueryClient(client))
    await client.query(completion === 'commit' ? 'COMMIT' : 'ROLLBACK')
    transactionFinished = true
    return result
  } catch (error) {
    if (transactionStarted && !transactionFinished) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        error.rollbackError = rollbackError
      }
    }
    throw error
  } finally {
    client?.release()
  }
}
