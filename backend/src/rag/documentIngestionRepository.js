import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from '../repositories/dataApiError.js'

export function createDocumentIngestionRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async findVersionByHash(auth, externalId, hash) {
      const client = createDataClient(auth)
      const { data: document, error: documentError } = await client.from('documents').select('id').eq('source_provider', 'google_drive').eq('external_id', externalId).maybeSingle()
      throwDataApiError(documentError)
      if (!document) return null
      const { data, error } = await client.from('document_versions').select('id').eq('document_id', document.id).eq('content_hash', hash).maybeSingle()
      throwDataApiError(error)
      return data ? { documentId: document.id, versionId: data.id } : null
    },

    async persistDocument(auth, payload) {
      const client = createDataClient(auth)
      const { data: document, error: documentError } = await client.from('documents').upsert({ source_provider: 'google_drive', external_id: payload.externalId, title: payload.title, mime_type: payload.mimeType, document_status: 'pending', deleted_at: null }, { onConflict: 'source_provider,external_id' }).select('id').single()
      throwDataApiError(documentError)
      const { data: version, error: versionError } = await client.from('document_versions').insert({ document_id: document.id, version_label: payload.contentHash, content_hash: payload.contentHash, source_modified_at: payload.sourceModifiedAt, processing_status: 'processing' }).select('id').single()
      throwDataApiError(versionError)
      try {
        const rows = payload.chunks.map((chunk, index) => ({ document_version_id: version.id, chunk_index: index, content: chunk.content, section: chunk.section, token_count: chunk.tokenCount }))
        const { data: storedChunks, error: chunkError } = await client.from('document_chunks').insert(rows).select('id,chunk_index')
        throwDataApiError(chunkError)
        const embeddingRows = storedChunks.map((chunk) => ({ document_chunk_id: chunk.id, embedding: payload.chunks[chunk.chunk_index].embedding, model_name: payload.embeddingModel ?? 'unknown' }))
        const { error: embeddingError } = await client.from('document_chunk_embeddings').insert(embeddingRows)
        throwDataApiError(embeddingError)
        const { error: completeError } = await client.from('document_versions').update({ processing_status: 'processed', processed_at: new Date().toISOString(), processing_error: null }).eq('id', version.id)
        throwDataApiError(completeError)
        return { outcome: 'changed', documentId: document.id, versionId: version.id }
      } catch (error) {
        await client.from('document_versions').update({ processing_status: 'failed', processing_error: 'Document ingestion failed.' }).eq('id', version.id)
        throw error
      }
    },

    async listKnownExternalIds(auth) {
      const { data, error } = await createDataClient(auth).from('documents').select('external_id').eq('source_provider', 'google_drive').is('deleted_at', null)
      throwDataApiError(error)
      return (data ?? []).map((row) => row.external_id).filter(Boolean)
    },

    async archiveExternalIds(auth, externalIds) {
      if (!externalIds.length) return 0
      const { data, error } = await createDataClient(auth).from('documents').update({ document_status: 'archived', deleted_at: new Date().toISOString() }).eq('source_provider', 'google_drive').in('external_id', externalIds).select('id')
      throwDataApiError(error)
      return data?.length ?? 0
    },

    async startRun(auth) {
      const { data, error } = await createDataClient(auth).from('document_sync_runs').insert({ source_provider: 'google_drive', status: 'started' }).select('id').single()
      throwDataApiError(error)
      return data
    },

    async finishRun(auth, id, { status, examined = 0, changed = 0 }) {
      if (!id) return
      const { error } = await createDataClient(auth).from('document_sync_runs').update({ status, finished_at: new Date().toISOString(), documents_examined: examined, documents_changed: changed }).eq('id', id)
      throwDataApiError(error)
    },
  }
}
