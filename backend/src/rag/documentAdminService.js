import { createGeminiProvider } from './geminiProvider.js'
import { createDocumentExtractors } from './documentExtractors.js'
import { createDocumentIngestionRepository } from './documentIngestionRepository.js'
import { createDocumentIngestionService } from './documentIngestionService.js'
import { createDocumentSyncService } from './documentSyncService.js'
import { createGoogleDriveClient } from './googleDriveClient.js'

export function createDocumentAdminService() {
  let syncService
  function getSyncService() {
    if (syncService) return syncService
    const drive = createGoogleDriveClient()
    const repository = createDocumentIngestionRepository()
    const ingestion = createDocumentIngestionService({
      extractors: createDocumentExtractors(),
      embeddings: createGeminiProvider(),
      repository,
    })
    syncService = createDocumentSyncService({ drive, ingestion, repository })
    return syncService
  }
  return { sync: async (auth) => getSyncService().sync(auth) }
}
