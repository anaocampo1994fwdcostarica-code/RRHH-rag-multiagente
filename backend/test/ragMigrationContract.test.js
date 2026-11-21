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

const driveMigrationUrl = new URL('supabase/migrations/20261121100000_drive_rag_ingestion_and_editorial_flow.sql', root)
const statusUrl = new URL('supabase/manual_checks/20261119_migration_status_readonly.sql', root)

function sqlFunction(code, name) {
  const start = code.search(new RegExp(`create (or replace )?function public\\.${name}\\(`))
  assert.ok(start >= 0, `falta ${name}`)
  return code.slice(start, code.indexOf('$$;', start))
}

test('la migración de Drive recrea match_policy_chunks con los mismos filtros de publicación y permisos', async () => {
  const code = (await readFile(driveMigrationUrl, 'utf8')).replace(/--.*$/gm, '')
  const rpc = sqlFunction(code, 'match_policy_chunks')
  for (const predicate of [
    'if auth.uid() is null',
    "document.document_status = 'published'",
    'document.deleted_at is null',
    "document_version.processing_status = 'processed'",
    'policy_version.is_current',
    "policy.status = 'published'",
    'policy.archived_at is null',
    'document_code text',
    'security definer',
  ]) assert.ok(rpc.includes(predicate), predicate)
  assert.ok(code.includes('revoke all on function public.match_policy_chunks(extensions.vector(768), integer, real) from public, anon, service_role;'))
  assert.ok(code.includes('grant execute on function public.match_policy_chunks(extensions.vector(768), integer, real) to authenticated;'))
  assert.doesNotMatch(code, /grant [^;]*\bto\b[^;]*\b(anon|public)\b/, 'nada se concede a anon ni a PUBLIC')
})

test('las tablas nuevas tienen RLS y authenticated solo lee; las escrituras van por funciones con permiso', async () => {
  const code = (await readFile(driveMigrationUrl, 'utf8')).replace(/--.*$/gm, '')
  for (const table of ['document_status_history', 'drive_sync_state']) {
    assert.ok(code.includes(`alter table public.${table} enable row level security;`), table)
    assert.ok(code.includes(`revoke all on table public.${table} from public, anon, authenticated;`), table)
    assert.ok(code.includes(`grant select on table public.${table} to authenticated;`), table)
    assert.doesNotMatch(code, new RegExp(`grant (insert|update|delete|all)[^;]*public\\.${table}[^;]*to authenticated`), table)
  }
  for (const name of ['submit_document_for_review', 'publish_document_version', 'archive_document', 'save_drive_sync_token']) {
    const body = sqlFunction(code, name)
    assert.match(body, /security definer/, name)
    assert.match(body, /set search_path = pg_catalog, public, pg_temp/, name)
    assert.match(body, /document_editorial_actor|has_permission\('documents\.manage'\)/, name)
  }
  assert.match(sqlFunction(code, 'document_editorial_actor'), /has_permission\('policies\.manage'\)/)
  assert.match(sqlFunction(code, 'publish_document_version'), /insert into public\.document_status_history/)
  assert.match(sqlFunction(code, 'archive_document'), /insert into public\.document_status_history/)
  assert.doesNotMatch(sqlFunction(code, 'archive_document'), /delete from/, 'archivar no borra')
})

test('el archivo de estado incluye la migración de Drive', async () => {
  const status = await readFile(statusUrl, 'utf8')
  assert.match(status, /20261121100000_drive_rag_ingestion_and_editorial_flow/)
  assert.match(status, /document_chunk_embeddings_embedding_hnsw_idx/)
})
