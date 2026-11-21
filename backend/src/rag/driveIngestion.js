// Ingesta de políticas desde Google Drive con el flujo editorial de la base:
// pending -> in_review (submit_document_for_review) -> published (publish_document_version).
// Cada documento se escribe en UNA transacción como el usuario de RRHH (RLS y auth.uid() reales):
// si algo falla, ese documento queda como estaba y la ingesta sigue con los demás.
import { createHash } from 'node:crypto'
import { extractPolicy } from './policyExtractor.js'
import { chunkPolicy } from './policyChunker.js'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const vectorLiteral = (values) => `[${values.join(',')}]`

/** Huella del contenido: cambia si cambia el texto o un metadato que se cita. */
export function policyContentHash(metadata, chunks) {
  return sha256(JSON.stringify({ m: [metadata.title, metadata.code, metadata.version, metadata.effectiveFrom, metadata.owner], c: chunks.map((chunk) => [chunk.section, chunk.content]) }))
}

export function createDriveIngestion({ drive, embeddings, transaction, extract = extractPolicy }) {
  if (!drive || !embeddings?.embed || typeof transaction !== 'function') throw new TypeError('Drive ingestion requires drive, embeddings and transaction.')

  async function upsertDocument(client, file, metadata) {
    const { rows: [document] } = await client.query(
      `insert into public.documents (source_provider, external_id, title, mime_type, document_code, web_view_link, folder_path, last_seen_at, document_status)
       values ('google_drive', $1, $2, $3, $4, $5, $6, now(), 'pending')
       on conflict (source_provider, external_id) do update set
         title = excluded.title, mime_type = excluded.mime_type, document_code = excluded.document_code,
         web_view_link = excluded.web_view_link, folder_path = excluded.folder_path, last_seen_at = now(),
         deleted_at = null, archived_reason = null,
         document_status = case when public.documents.document_status in ('archived', 'failed') then 'pending' else public.documents.document_status end
       returning id, document_status`,
      [file.id, file.name, file.mimeType, metadata.code, file.webViewLink ?? null, file.folderPath ?? null],
    )
    return document
  }

  async function advanceToPublished(client, document, versionId, note) {
    if (document.document_status === 'pending') {
      await client.query('select public.submit_document_for_review($1, $2)', [document.id, note])
    }
    await client.query('select public.publish_document_version($1, $2)', [versionId, note])
  }

  async function currentPublishedVersion(client, documentId) {
    const { rows } = await client.query(
      `select dv.id, dv.content_hash from public.policy_versions pv
       join public.document_versions dv on dv.id = pv.source_document_version_id
       where dv.document_id = $1 and pv.is_current`, [documentId])
    return rows[0] ?? null
  }

  return {
    /** Ingesta un archivo. outcome: created | updated | unchanged. */
    async ingestFile(auth, file, { note = 'Ingesta desde Google Drive' } = {}) {
      const parsed = await extract(file, drive)
      if (!parsed.metadata.code) throw new Error('No se encontró el código del documento en su tabla inicial.')
      const chunks = chunkPolicy(parsed, { fallbackTitle: file.name })
      if (!chunks.length) throw new Error('El documento no tiene contenido para indexar.')
      const hash = policyContentHash(parsed.metadata, chunks)
      const summary = { externalId: file.id, name: file.name, code: parsed.metadata.code, version: parsed.metadata.version ?? null, chunks: chunks.length }

      // 1) Sin cambios: solo se refrescan título, enlace y carpeta (cubre renombrados).
      const existing = await transaction(auth, async (client) => {
        const document = await upsertDocument(client, file, parsed.metadata)
        const current = await currentPublishedVersion(client, document.id)
        return { document, unchanged: document.document_status === 'published' && current?.content_hash === hash }
      })
      if (existing.unchanged) return { ...summary, outcome: 'unchanged', status: 'published', documentId: existing.document.id }

      // 2) Embeddings fuera de la transacción (es lo lento); luego todo se escribe de una vez.
      const vectors = []
      for (const chunk of chunks) vectors.push(await embeddings.embed(chunk.content, 'RETRIEVAL_DOCUMENT'))

      return transaction(auth, async (client) => {
        const document = await upsertDocument(client, file, parsed.metadata)
        const wasPublished = document.document_status === 'published'
        const { rows: [reused] } = await client.query(
          `select id from public.document_versions where document_id = $1 and content_hash = $2 and processing_status = 'processed'`, [document.id, hash])
        let versionId = reused?.id
        if (!versionId) {
          const { rows: [version] } = await client.query(
            `insert into public.document_versions (document_id, version_label, content_hash, source_modified_at, processing_status,
               doc_version, effective_from, owner, document_title, embedding_model)
             values ($1, $2, $3, $4, 'processing', $5, $6, $7, $8, $9) returning id`,
            [document.id, `v${parsed.metadata.version ?? '0'}-${hash.slice(0, 12)}`, hash, file.modifiedTime ?? null,
              parsed.metadata.version ?? null, parsed.metadata.effectiveFromDate, parsed.metadata.owner ?? null,
              parsed.metadata.title ?? file.name, embeddings.model ?? null])
          versionId = version.id
          for (const [index, chunk] of chunks.entries()) {
            const { rows: [stored] } = await client.query(
              `insert into public.document_chunks (document_version_id, chunk_index, content, section, token_count, document_code, doc_version, source_url, metadata)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
              [versionId, index, chunk.content, chunk.section, Math.ceil(chunk.content.length / 4), parsed.metadata.code,
                parsed.metadata.version ?? null, file.webViewLink ?? null, JSON.stringify({ title: parsed.metadata.title ?? file.name, folderPath: file.folderPath ?? null })])
            await client.query(
              'insert into public.document_chunk_embeddings (document_chunk_id, embedding, model_name) values ($1, $2::extensions.vector, $3)',
              [stored.id, vectorLiteral(vectors[index]), embeddings.model ?? 'unknown'])
          }
          await client.query(`update public.document_versions set processing_status = 'processed', processed_at = now() where id = $1`, [versionId])
        }
        await advanceToPublished(client, document, versionId, note)
        return { ...summary, outcome: wasPublished ? 'updated' : 'created', status: 'published', documentId: document.id, versionId }
      })
    },

    /** Archiva (no borra) un documento que salió de la carpeta o se eliminó. */
    async archiveByExternalId(auth, externalId, reason) {
      return transaction(auth, async (client) => {
        const { rows: [document] } = await client.query(
          `select id, document_status from public.documents where source_provider = 'google_drive' and external_id = $1`, [externalId])
        if (!document || document.document_status === 'archived') return false
        await client.query('select public.archive_document($1, $2)', [document.id, reason])
        return true
      })
    },

    async startRun(auth, kind, tokenBefore = null) {
      return transaction(auth, async (client) => (await client.query(
        `insert into public.document_sync_runs (source_provider, status, run_kind, triggered_by, start_page_token_before)
         values ('google_drive', 'started', $1, auth.uid(), $2) returning id`, [kind, tokenBefore])).rows[0].id)
    },

    async finishRun(auth, runId, { failed, results, tokenAfter = null }) {
      const count = (outcome) => results.filter((result) => result.outcome === outcome).length
      await transaction(auth, (client) => client.query(
        `update public.document_sync_runs set status = $2, finished_at = now(), documents_examined = $3,
           documents_changed = $4, documents_created = $5, documents_updated = $6, documents_archived = $7,
           documents_failed = $8, start_page_token_after = $9, details = $10::jsonb,
           error_message = case when $8 > 0 then 'Algunos documentos fallaron (ver details).' else null end
         where id = $1`,
        [runId, failed && results.every((result) => result.outcome === 'failed') ? 'failed' : 'completed', results.length,
          count('created') + count('updated') + count('archived'), count('created'), count('updated'), count('archived'),
          count('failed'), tokenAfter, JSON.stringify(results.map(({ externalId, name, code, outcome, error }) => ({ externalId, name, code, outcome, error })))]))
    },

    async saveStartPageToken(auth, folderId, token) {
      await transaction(auth, (client) => client.query('select public.save_drive_sync_token($1, $2)', [folderId, token]))
    },

    async loadStartPageToken(auth) {
      return transaction(auth, async (client) => (await client.query(
        `select start_page_token, folder_id from public.drive_sync_state where source_provider = 'google_drive'`)).rows[0] ?? null)
    },
  }
}
