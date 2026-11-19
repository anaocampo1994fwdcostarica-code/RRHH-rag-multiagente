import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocumentExtractors } from '../src/rag/documentExtractors.js'
import { createDocumentIngestionService } from '../src/rag/documentIngestionService.js'
import { createDocumentSyncService } from '../src/rag/documentSyncService.js'
import { createGoogleDriveClient } from '../src/rag/googleDriveClient.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const policyText = 'Política de vacaciones. '.repeat(80)

test('lists supported Drive documents across pages using an injected read-only client', async () => {
  let calls = 0
  const client = createGoogleDriveClient({
    clientEmail: 'service@example.test', privateKey: 'private-key', folderId: 'approved-folder', retries: 0,
    googleApi: {
      auth: { JWT: class {} },
      drive: () => ({ files: { list: async ({ pageToken }) => {
        calls += 1
        return { data: pageToken ? { files: [{ id: 'doc', name: 'Política', mimeType: 'application/vnd.google-apps.document' }] } : { nextPageToken: 'next', files: [{ id: 'pdf', name: 'PDF', mimeType: 'application/pdf' }, { id: 'ignored', mimeType: 'text/plain' }] } }
      } } }),
      sheets: () => ({}),
    },
  })
  const files = await client.listFiles()
  assert.equal(calls, 2)
  assert.deepEqual(files.map((file) => file.id), ['pdf', 'doc'])
})

test('does not create a Drive client session when required credentials are absent', async () => {
  const client = createGoogleDriveClient({ googleApi: { auth: { JWT: class {} } } })
  await assert.rejects(client.listFiles(), /GOOGLE_DRIVE_FOLDER_ID/)
})

test('extractors preserve Google Docs, Sheets tabs, and PDF text with local mocks', async () => {
  const drive = {
    exportGoogleDoc: async () => 'Documento\n\n de prueba',
    readGoogleSheet: async () => [{ section: 'Reglas', text: 'Fila 1\tFila 2' }, { section: 'Vacía', text: '  ' }],
    downloadPdf: async () => Buffer.from('fake-pdf'),
  }
  const extractors = createDocumentExtractors({ createPdfParser: () => ({ getText: async () => ({ text: 'PDF\r\n interno' }), destroy: async () => {} }) })
  assert.deepEqual(await extractors.extract({ id: 'doc', mimeType: 'application/vnd.google-apps.document' }, drive), [{ section: null, text: 'Documento\n\n de prueba' }])
  assert.deepEqual(await extractors.extract({ id: 'sheet', mimeType: 'application/vnd.google-apps.spreadsheet' }, drive), [{ section: 'Reglas', text: 'Fila 1 Fila 2' }])
  assert.deepEqual(await extractors.extract({ id: 'pdf', mimeType: 'application/pdf' }, drive), [{ section: null, text: 'PDF\n interno' }])
})

test('ingestion creates stable chunks, embeddings, and skips an identical version', async () => {
  const persisted = []
  const service = createDocumentIngestionService({
    extractors: { extract: async () => [{ section: 'Vacaciones', text: policyText }] },
    embeddings: { embed: async () => Array.from({ length: 768 }, () => 0.1) },
    repository: {
      findVersionByHash: async () => null,
      persistDocument: async (_auth, payload) => { persisted.push(payload); return { outcome: 'changed', documentId: 'document-1' } },
      archiveExternalIds: async () => 0,
    },
  })
  const file = { id: 'drive-file', name: 'Política', mimeType: 'application/pdf', modifiedTime: '2026-11-19T00:00:00Z' }
  const result = await service.ingest(auth, file, {})
  assert.equal(result.outcome, 'changed')
  assert.equal(persisted[0].chunks.length > 0, true)
  assert.equal(persisted[0].chunks[0].embedding.length, 768)
  assert.equal(persisted[0].contentHash.length, 64)

  const unchanged = createDocumentIngestionService({
    extractors: { extract: async () => [{ section: 'Vacaciones', text: policyText }] },
    embeddings: { embed: async () => { throw new Error('must not embed') }, },
    repository: { findVersionByHash: async () => ({ documentId: 'document-1' }), persistDocument: async () => { throw new Error('must not persist') }, archiveExternalIds: async () => 0 },
  })
  assert.equal((await unchanged.ingest(auth, file, {})).outcome, 'unchanged')
})

test('incremental sync archives only Drive documents no longer returned by the approved folder', async () => {
  const calls = []
  const sync = createDocumentSyncService({
    drive: { listFiles: async () => [{ id: 'current' }] },
    ingestion: { ingest: async () => ({ outcome: 'changed' }), archiveMissing: async (_auth, ids) => { calls.push(ids); return ids.length } },
    repository: { listKnownExternalIds: async () => ['current', 'removed'] },
  })
  const result = await sync.sync(auth)
  assert.deepEqual(calls, [['removed']])
  assert.equal(result.archived, 1)
})

test('ingestion rejects missing authenticated identity and does not create credentials', async () => {
  const service = createDocumentIngestionService({ extractors: { extract: async () => [] }, embeddings: { embed: async () => [] }, repository: { persistDocument: async () => {}, archiveExternalIds: async () => {} } })
  await assert.rejects(service.ingest({}, { id: 'file' }, {}), /Verified authenticated identity/)
})
