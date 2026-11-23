import { apiClient } from '../../api/client.js'

export function listDocuments(client = apiClient) {
  return client.request('/admin/documents')
}

export function getLastDocumentSync(client = apiClient) {
  return client.request('/admin/documents/sync/last')
}

export function requestDocumentSync(client = apiClient) {
  return client.request('/admin/documents/sync', { method: 'POST', body: {} })
}
