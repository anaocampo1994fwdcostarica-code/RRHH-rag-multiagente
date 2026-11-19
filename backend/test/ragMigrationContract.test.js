import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createVectorRepository } from '../src/rag/vectorRepository.js'

const root = new URL('../..', import.meta.url)
const migrationUrl = new URL('supabase/migrations/20261119100000_add_policy_rag_pgvector.sql', root)
const editorialMigrationUrl = new URL('supabase/migrations/20261119101000_add_document_editorial_review_states.sql', root)
const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const embedding = Array.from({ length: 768 }, () => 0.01)

test('the local RAG migration constrains RPC retrieval to published, processed, linked policy sources', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  for (const predicate of [
    'query_embedding extensions.vector(768)',
    'if auth.uid() is null',
    "document.document_status = 'published'",
    "document_version.processing_status = 'processed'",
    'policy_version.is_current',
    "policy.status = 'published'",
    'policy.archived_at is null',
    'revoke all on function public.match_policy_chunks',
    'grant execute on function public.match_policy_chunks',
  ]) assert.equal(sql.includes(predicate), true, predicate)
})

test('the editorial migration keeps technical processing separate and never publishes automatically', async () => {
  const sql = await readFile(editorialMigrationUrl, 'utf8')
  assert.equal(sql.includes("set document_status = 'in_review'"), true)
  assert.equal(sql.includes("'published'"), true)
  assert.equal(sql.includes("set document_status = 'published'"), false)
})

test('the vector repository forwards only validated embeddings to the RPC and preserves simulated authorized rows', async () => {
  const expected = [{ content: 'Contenido autorizado', document_id: 'doc', document_title: 'Política', section: 'Sección', version: 'v1', document_url: null, similarity: 0.9 }]
  const repository = createVectorRepository({ createDataClient: () => ({ rpc: async () => ({ data: expected, error: null }) }) })
  assert.deepEqual(await repository.search(auth, embedding), expected)
  await assert.rejects(repository.search(auth, [...embedding, 1]), /Invalid query embedding/)
})
