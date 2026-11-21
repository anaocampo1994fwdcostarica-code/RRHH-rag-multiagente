// Ingesta de políticas desde Google Drive con el flujo editorial de la base:
// pending -> in_review (submit_document_for_review) -> published (publish_document_version).
// Cada documento se escribe en UNA transacción como el usuario de RRHH (RLS y auth.uid() reales):
// si algo falla, ese documento queda como estaba y la ingesta sigue con los demás.
import { createHash } from 'node:crypto'
import { extractPolicy } from './policyExtractor.js'
import { chunkPolicy } from './policyChunker.js'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const vectorLiteral = (values) => `[${values.join(',')}]`

/** Error de contenido que se repetirá igual en cada intento (no debe bloquear el token de sincronización). */
export class PolicyContentError extends Error {
  constructor(message) { super(message); this.name = 'PolicyContentError'; this.permanent = true }
}

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
         web_view_link = coalesce(excluded.web_view_link, public.documents.web_view_link),
         folder_path = coalesce(excluded.folder_path, public.documents.folder_path), last_seen_at = now(),
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

  // Solo lectura: estado actual, hash vigente y si ya existe una versión procesada con este contenido.
  async function inspect(client, externalId, hash) {
    const { rows: [document] } = await client.query(
      `select d.id, d.document_status,
         (select dv.content_hash from public.policy_versions pv join public.document_versions dv on dv.id = pv.source_document_version_id
          where dv.document_id = d.id and pv.is_current) as current_hash,
         (select dv.id from public.document_versions dv where dv.document_id = d.id and dv.content_hash = $2 and dv.processing_status = 'processed') as reusable_version,
         (select dv.embedding_model from public.document_versions dv where dv.document_id = d.id and dv.content_hash = $2 and dv.processing_status = 'processed') as reusable_model
       from public.documents d where d.source_provider = 'google_drive' and d.external_id = $1`, [externalId, hash])
    return document ?? null
  }

  /**
   * Recalcula los embeddings de una versión con el modelo activo, en su lugar (misma versión, mismo texto).
   * Lo usan la ingesta cuando cambia el modelo y npm run embeddings:rebuild.
   */
  async function reembedVersion(auth, versionId) {
    const chunks = await transaction(auth, async (client) => (await client.query(
      'select id, content from public.document_chunks where document_version_id = $1 order by chunk_index', [versionId])).rows)
    const vectors = []
    for (const chunk of chunks) vectors.push(await embeddings.embed(chunk.content, 'RETRIEVAL_DOCUMENT'))
    await transaction(auth, async (client) => {
      for (const [index, chunk] of chunks.entries()) {
        await client.query(
          `insert into public.document_chunk_embeddings (document_chunk_id, embedding, model_name, embedded_at) values ($1, $2::extensions.vector, $3, now())
           on conflict (document_chunk_id) do update set embedding = excluded.embedding, model_name = excluded.model_name, embedded_at = now()`,
          [chunk.id, vectorLiteral(vectors[index]), embeddings.model ?? 'unknown'])
      }
      await client.query('update public.document_versions set embedding_model = $2 where id = $1', [versionId, embeddings.model ?? null])
    })
    return chunks.length
  }

  return {
    /** Ingesta un archivo. outcome: created | updated | unchanged | skipped. */
    async ingestFile(auth, file, { note = 'Ingesta desde Google Drive' } = {}) {
      const parsed = await extract(file, drive)
      if (!parsed.metadata.code) throw new PolicyContentError('No se encontró el código del documento en su tabla inicial.')
      const chunks = chunkPolicy(parsed, { fallbackTitle: file.name })
      if (!chunks.length) throw new PolicyContentError('El documento no tiene contenido para indexar.')
      const hash = policyContentHash(parsed.metadata, chunks)
      const summary = { externalId: file.id, name: file.name, code: parsed.metadata.code, version: parsed.metadata.version ?? null, chunks: chunks.length }

      // 1) Lectura sin escribir nada: si algo falla después, el documento queda exactamente como estaba.
      const existing = await transaction(auth, (client) => inspect(client, file.id, hash))

      // Un documento en revisión humana (cargado desde el portal) no se publica solo por sincronizar.
      if (existing?.document_status === 'in_review') {
        return { ...summary, outcome: 'skipped', status: 'in_review', reason: 'En revisión manual: publícalo o archívalo desde el portal.', documentId: existing.id }
      }

      // Misma versión de texto con otro modelo de embeddings: se recalculan sus vectores en su lugar.
      const modelChanged = Boolean(existing?.reusable_version) && existing.reusable_model !== (embeddings.model ?? null)
      if (modelChanged) await reembedVersion(auth, existing.reusable_version)

      // 2) Sin cambios de contenido: solo se refrescan título, código, enlace y carpeta (cubre renombrados).
      if (existing?.document_status === 'published' && existing.current_hash === hash) {
        await transaction(auth, (client) => client.query(
          `update public.documents set title = $2, document_code = $3, web_view_link = coalesce($4, web_view_link),
             folder_path = coalesce($5, folder_path), last_seen_at = now() where id = $1`,
          [existing.id, file.name, parsed.metadata.code, file.webViewLink ?? null, file.folderPath ?? null]))
        return { ...summary, outcome: modelChanged ? 'reembedded' : 'unchanged', status: 'published', documentId: existing.id }
      }

      // 3) Embeddings fuera de la transacción (es lo lento) y solo si no hay una versión procesada reutilizable.
      const vectors = []
      if (!existing?.reusable_version) {
        for (const chunk of chunks) vectors.push(await embeddings.embed(chunk.content, 'RETRIEVAL_DOCUMENT'))
      }

      // 4) Una transacción: documento, versión, fragmentos, embeddings y publicación.
      return transaction(auth, async (client) => {
        const document = await upsertDocument(client, file, parsed.metadata)
        const wasPublished = document.document_status === 'published'
        let versionId = existing?.reusable_version ?? null
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

    reembedVersion,

    /** Versiones vigentes (las que sirve el RAG) con su modelo de embeddings, para embeddings:rebuild. */
    async listCurrentVersions(auth) {
      return transaction(auth, async (client) => (await client.query(
        `select dv.id, d.document_code, dv.embedding_model from public.policy_versions pv
         join public.document_versions dv on dv.id = pv.source_document_version_id
         join public.documents d on d.id = dv.document_id
         where pv.is_current and d.deleted_at is null order by d.document_code`)).rows)
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
      const examined = results.filter((result) => result.outcome !== 'info').length
      await transaction(auth, (client) => client.query(
        `update public.document_sync_runs set status = $2, finished_at = now(), documents_examined = $3,
           documents_changed = $4, documents_created = $5, documents_updated = $6, documents_archived = $7,
           documents_failed = $8, start_page_token_after = $9, details = $10::jsonb,
           error_message = case when $8 > 0 then 'Algunos documentos fallaron (ver details).' else null end
         where id = $1`,
        [runId, failed && results.every((result) => ['failed', 'info'].includes(result.outcome)) ? 'failed' : 'completed', examined,
          count('created') + count('updated') + count('archived') + count('renamed') + count('reembedded'), count('created'), count('updated'), count('archived'),
          count('failed'), tokenAfter, JSON.stringify(results.map(({ externalId, name, code, outcome, error, reason, permanent }) => ({ externalId, name, code, outcome, error, reason, permanent })))]))
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
