import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from './dataApiError.js'

const documentColumns = 'id,title,mime_type,document_status,updated_at,document_versions(id,version_label,processing_status,processing_error,processed_at,policy_versions(id,is_current,hr_policies(id,title,status,archived_at)))'

export function createDocumentsRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async list(auth, { limit = 20, offset = 0 } = {}) {
      const { data, error, count } = await createDataClient(auth)
        .from('documents')
        .select(documentColumns, { count: 'exact' })
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1)
      throwDataApiError(error)
      return { rows: data ?? [], total: count ?? 0 }
    },
  }
}

export const documentsRepository = createDocumentsRepository()
