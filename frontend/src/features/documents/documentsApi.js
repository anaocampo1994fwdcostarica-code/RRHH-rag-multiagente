import { apiClient } from '../../api/client.js'

export function listDocuments({ page = 1, limit = 20 } = {}) {
  return apiClient.request(`/admin/documents?page=${page}&limit=${limit}`)
}

export function requestDocumentSync() {
  return apiClient.request('/admin/documents/sync', { method: 'POST', body: {} })
}
