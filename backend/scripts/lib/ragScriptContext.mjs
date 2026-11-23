// Contexto común de los scripts de RAG: identidad de RRHH que firma, transacción con RLS y proveedores.
// La identidad es RAG_INGEST_USER_ID si existe; si no, el usuario RRHH del harness (rls.hr, DEMO-011),
// buscado solo en el proyecto de PRUEBAS.
import '../../src/config/env.js'
import { createVerifiedAuthIdentity } from '../../src/security/authIdentity.js'
import { withUserTransaction } from '../../src/services/withUserTransaction.js'
import { getPostgresPool } from '../../src/services/postgresPool.js'
import { createEmbeddingProvider } from '../../src/llm/providers.js'
import { connectHarnessAdmin, readHarnessEnv, userIdByEmail } from './harnessAdmin.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function resolveIngestIdentity() {
  let userId = process.env.RAG_INGEST_USER_ID?.trim()
  if (userId && !UUID.test(userId)) throw new Error('RAG_INGEST_USER_ID debe ser un UUID.')
  if (!userId) {
    const admin = await connectHarnessAdmin()
    try {
      await admin.query('begin read only')
      userId = await userIdByEmail(admin, readHarnessEnv().RLS_TEST_HR_EMAIL)
    } finally {
      await admin.query('rollback').catch(() => {})
      await admin.end()
    }
  }
  return createVerifiedAuthIdentity({ userId, role: 'authenticated' })
}

export const transaction = (auth, callback) => withUserTransaction(auth, callback)

export async function createScriptEmbeddings() {
  const embeddings = createEmbeddingProvider()
  if (typeof embeddings.preload === 'function') await embeddings.preload()
  return embeddings
}

export async function closeScriptPool() {
  await (await getPostgresPool()).end?.()
}
