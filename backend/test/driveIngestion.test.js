import assert from 'node:assert/strict'
import test from 'node:test'
import { createDriveIngestion, policyContentHash } from '../src/rag/driveIngestion.js'
import { ARCHIVE_REASONS, classifyChange, createDriveSync } from '../src/rag/driveSync.js'

const DOC = 'application/vnd.google-apps.document'
const PARSED = {
  metadata: { title: 'Política de Vacaciones', code: 'POL-RH-01', version: '1.0', effectiveFrom: '1 de enero de 2026', effectiveFromDate: '2026-01-01', owner: 'RRHH' },
  intro: '',
  sections: [{ section: '1. Días', text: 'Quince días hábiles por año.' }],
}

// Cliente SQL falso: responde según el texto de la consulta y registra todo lo ejecutado.
function fakeDatabase({ status = 'pending', currentHash = null, reusedVersion = null } = {}) {
  const queries = []
  let transactions = 0
  const client = {
    async query(text, values = []) {
      assert.ok(!text.includes(';'), 'el envoltorio RLS rechaza consultas con punto y coma')
      queries.push({ text: text.replace(/\s+/g, ' ').trim(), values })
      if (text.includes('from public.documents d where')) return { rows: [{ id: 'doc-1', document_status: status, current_hash: currentHash, reusable_version: reusedVersion, reusable_model: 'test-e5' }] }
      if (text.includes('insert into public.documents')) return { rows: [{ id: 'doc-1', document_status: status }] }
      if (text.includes('insert into public.document_versions')) return { rows: [{ id: 'v-new' }] }
      if (text.includes('insert into public.document_chunks')) return { rows: [{ id: `chunk-${queries.length}` }] }
      return { rows: [] }
    },
  }
  return { queries, transaction: async (_auth, callback) => { transactions += 1; return callback(client) }, transactions: () => transactions }
}

const embeddings = { model: 'test-e5', calls: 0, async embed(_text, task) { assert.equal(task, 'RETRIEVAL_DOCUMENT'); this.calls += 1; return [0.1, 0.2] } }
const file = { id: 'file-1', name: 'POL-01_Politica_de_vacaciones', mimeType: DOC, webViewLink: 'https://docs.google.com/document/d/file-1/edit', folderPath: 'Café Volcán' }

test('un documento nuevo se indexa y se publica por las funciones editoriales (pending -> in_review -> published)', async () => {
  const db = fakeDatabase({ status: 'pending' })
  const ingestion = createDriveIngestion({ drive: {}, embeddings, transaction: db.transaction, extract: async () => PARSED })
  const result = await ingestion.ingestFile({ userId: 'hr' }, file, { note: 'prueba' })

  assert.equal(result.outcome, 'created')
  assert.equal(result.code, 'POL-RH-01')
  assert.equal(result.chunks, 2) // Información del documento + 1. Días
  const texts = db.queries.map((query) => query.text)
  const submit = texts.findIndex((text) => text.startsWith('select public.submit_document_for_review'))
  const publish = texts.findIndex((text) => text.startsWith('select public.publish_document_version'))
  assert.ok(submit >= 0 && publish > submit, 'primero revisión, luego publicación')
  assert.ok(texts.findIndex((text) => text.includes("processing_status = 'processed'")) < publish, 'solo se publica una versión procesada')
  assert.equal(texts.filter((text) => text.includes('insert into public.document_chunk_embeddings')).length, 2)
  assert.ok(!texts.some((text) => /update public\.documents set document_status/.test(text)), 'nunca se publica con un UPDATE directo')
  const chunkInsert = db.queries.find((query) => query.text.includes('insert into public.document_chunks'))
  assert.equal(chunkInsert.values[5], 'POL-RH-01')
  assert.equal(chunkInsert.values[7], file.webViewLink)
})

test('un documento ya publicado sin cambios no recalcula embeddings ni crea versión', async () => {
  const chunksHash = policyContentHash(PARSED.metadata, (await import('../src/rag/policyChunker.js')).chunkPolicy(PARSED, { fallbackTitle: file.name }))
  const db = fakeDatabase({ status: 'published', currentHash: chunksHash, reusedVersion: 'v-old' })
  const counter = { ...embeddings, calls: 0 }
  const ingestion = createDriveIngestion({ drive: {}, embeddings: counter, transaction: db.transaction, extract: async () => PARSED })
  const result = await ingestion.ingestFile({ userId: 'hr' }, file)
  assert.equal(result.outcome, 'unchanged')
  assert.equal(counter.calls, 0)
  assert.equal(db.transactions(), 2) // lectura + refresco de título y enlace
  assert.ok(!db.queries.some((query) => query.text.includes('insert into public.document_versions')))
})

test('una edición de un documento publicado crea una versión nueva y la publica sin volver a revisión', async () => {
  const db = fakeDatabase({ status: 'published', currentHash: 'hash-viejo' })
  const ingestion = createDriveIngestion({ drive: {}, embeddings, transaction: db.transaction, extract: async () => PARSED })
  const result = await ingestion.ingestFile({ userId: 'hr' }, file)
  assert.equal(result.outcome, 'updated')
  const texts = db.queries.map((query) => query.text)
  assert.ok(!texts.some((text) => text.startsWith('select public.submit_document_for_review')))
  assert.ok(texts.some((text) => text.startsWith('select public.publish_document_version')))
})

test('sin código en la tabla inicial el documento falla con un mensaje claro', async () => {
  const db = fakeDatabase()
  const ingestion = createDriveIngestion({ drive: {}, embeddings, transaction: db.transaction, extract: async () => ({ ...PARSED, metadata: { title: 'X' } }) })
  await assert.rejects(ingestion.ingestFile({ userId: 'hr' }, file), /código del documento/)
  assert.equal(db.queries.length, 0)
})

test('classifyChange: dentro de la carpeta se indexa; fuera, eliminado o en papelera se archiva; lo ajeno se ignora', () => {
  const folders = new Set(['root', 'sub'])
  const known = new Map([['known', { external_id: 'known', document_status: 'published' }], ['old', { external_id: 'old', document_status: 'archived' }]])
  const inside = { fileId: 'x', file: { mimeType: DOC, parents: ['sub'], trashed: false } }
  assert.deepEqual(classifyChange(inside, folders, known), { action: 'ingest', folderPath: null })
  assert.deepEqual(classifyChange({ fileId: 'known', file: { mimeType: DOC, parents: ['otra'] } }, folders, known), { action: 'archive', reason: ARCHIVE_REASONS.moved })
  assert.deepEqual(classifyChange({ fileId: 'known', removed: true }, folders, known), { action: 'archive', reason: ARCHIVE_REASONS.removed })
  assert.deepEqual(classifyChange({ fileId: 'known', file: { mimeType: DOC, parents: ['root'], trashed: true } }, folders, known), { action: 'archive', reason: ARCHIVE_REASONS.removed })
  assert.deepEqual(classifyChange({ fileId: 'old', removed: true }, folders, known), { action: 'ignore' })
  assert.deepEqual(classifyChange({ fileId: 'ajeno', file: { mimeType: DOC, parents: ['otra'] } }, folders, known), { action: 'ignore' })
  assert.deepEqual(classifyChange({ fileId: 'img', file: { mimeType: 'image/png', parents: ['root'] } }, folders, known), { action: 'ignore' })
})

function fakeIngestion(overrides = {}) {
  const calls = { saved: [], finished: [], archived: [], ingested: [] }
  return {
    calls,
    async loadStartPageToken() { return { start_page_token: 't1', folder_id: 'root' } },
    async startRun(_auth, kind, token) { calls.started = { kind, token }; return 'run-1' },
    async finishRun(_auth, runId, payload) { calls.finished.push({ runId, ...payload }) },
    async saveStartPageToken(_auth, folderId, token) { calls.saved.push({ folderId, token }) },
    async archiveByExternalId(_auth, id, reason) { calls.archived.push({ id, reason }); return true },
    async ingestFile(_auth, f) { calls.ingested.push(f.id); return { externalId: f.id, name: f.name, outcome: 'unchanged', status: 'published' } },
    ...overrides,
  }
}

test('sync incremental: procesa el último cambio por archivo, detecta renombrados, archiva movidos y guarda el token', async () => {
  const ingestion = fakeIngestion()
  const drive = {
    pages: [
      { nextPageToken: 't2', changes: [{ fileId: 'a', file: { id: 'a', name: 'viejo', mimeType: DOC, parents: ['root'] } }] },
      { newStartPageToken: 't3', changes: [{ fileId: 'a', file: { id: 'a', name: 'POL-01 nuevo nombre', mimeType: DOC, parents: ['root'] } }, { fileId: 'b', file: { id: 'b', name: 'POL-09', mimeType: DOC, parents: ['fuera'] } }] },
    ],
    async listChanges() { return this.pages.shift() },
    async listFolderIds() { return new Map([['root', '']]) },
  }
  const transaction = async (_auth, callback) => callback({ query: async () => ({ rows: [
    { external_id: 'a', title: 'POL-01 nombre anterior', document_status: 'published' },
    { external_id: 'b', title: 'POL-09', document_status: 'published' },
  ] }) })
  const report = await createDriveSync({ drive, ingestion, transaction, folderId: 'root' }).incremental({ userId: 'hr' })

  assert.equal(report.changesSeen, 2)
  assert.deepEqual(ingestion.calls.ingested, ['a'])
  assert.equal(report.results.find((result) => result.externalId === 'a').outcome, 'renamed')
  assert.deepEqual(ingestion.calls.archived, [{ id: 'b', reason: ARCHIVE_REASONS.moved }])
  assert.deepEqual(ingestion.calls.started, { kind: 'incremental', token: 't1' })
  assert.deepEqual(ingestion.calls.saved, [{ folderId: 'root', token: 't3' }])
})

test('sync incremental: si un documento falla, el token NO avanza para reintentarlo mañana', async () => {
  const ingestion = fakeIngestion({ async ingestFile() { throw new Error('Drive 500') } })
  const drive = {
    async listChanges() { return { newStartPageToken: 't9', changes: [{ fileId: 'a', file: { id: 'a', name: 'POL-01', mimeType: DOC, parents: ['root'] } }] } },
    async listFolderIds() { return new Map([['root', '']]) },
  }
  const transaction = async (_auth, callback) => callback({ query: async () => ({ rows: [] }) })
  const report = await createDriveSync({ drive, ingestion, transaction, folderId: 'root' }).incremental({ userId: 'hr' })
  assert.equal(report.failed, true)
  assert.deepEqual(ingestion.calls.saved, [])
  assert.equal(ingestion.calls.finished[0].failed, true)
  assert.equal(report.results[0].error, 'Drive 500')
})

test('sync incremental sin token guardado hace la ingesta completa', async () => {
  const ingestion = fakeIngestion({ async loadStartPageToken() { return null } })
  const drive = { async getStartPageToken() { return 'nuevo' }, async listFiles() { return [] } }
  const transaction = async (_auth, callback) => callback({ query: async () => ({ rows: [] }) })
  const report = await createDriveSync({ drive, ingestion, transaction, folderId: 'root' }).incremental({ userId: 'hr' })
  assert.equal(report.kind, 'full')
  assert.deepEqual(ingestion.calls.saved, [{ folderId: 'root', token: 'nuevo' }])
})
