import { createHash } from 'node:crypto'
import { chunkDocument, normalizeDocumentText } from './chunking.js'

function contentHash(sections) {
  return createHash('sha256').update(sections.map((section) => `${section.section ?? ''}\n${section.text}`).join('\n\n')).digest('hex')
}

function tokens(text) {
  return text ? text.trim().split(/\s+/u).length : 0
}

export function createDocumentIngestionService({ extractors, embeddings, repository, chunkOptions } = {}) {
  if (!extractors?.extract || !embeddings?.embed || !repository?.persistDocument) throw new TypeError('Document ingestion requires extractors, embeddings, and a repository.')

  return {
    async ingest(auth, file, drive) {
      if (!auth?.userId || auth.role !== 'authenticated') throw new Error('Verified authenticated identity required.')
      const sections = await extractors.extract(file, drive)
      const normalizedSections = sections.map((section) => ({ ...section, text: normalizeDocumentText(section.text) })).filter((section) => section.text)
      if (!normalizedSections.length) return { externalId: file.id, outcome: 'skipped_empty' }

      const hash = contentHash(normalizedSections)
      const existing = await repository.findVersionByHash(auth, file.id, hash)
      if (existing) return { externalId: file.id, outcome: 'unchanged', documentId: existing.documentId }

      const chunks = normalizedSections.flatMap((section) => chunkDocument(section.text, chunkOptions).map((chunk) => ({ ...chunk, section: section.section, tokenCount: tokens(chunk.content) })))
      const vectors = await Promise.all(chunks.map(async (chunk) => ({ ...chunk, embedding: await embeddings.embed(chunk.content, 'RETRIEVAL_DOCUMENT') })))
      return repository.persistDocument(auth, {
        externalId: file.id,
        title: file.name,
        mimeType: file.mimeType,
        sourceModifiedAt: file.modifiedTime ?? null,
        contentHash: hash,
        chunks: vectors,
      })
    },

    async archiveMissing(auth, externalIds) {
      if (!Array.isArray(externalIds)) throw new TypeError('externalIds must be an array.')
      return repository.archiveExternalIds(auth, externalIds)
    },
  }
}
