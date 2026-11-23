import { apiClient } from '../../api/client.js'

function query(filters) {
  const parameters = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') parameters.set(key, String(value)) })
  const value = parameters.toString()
  return value ? `?${value}` : ''
}

export function listPolicies(filters, client = apiClient) { return client.request(`/policies${query(filters)}`) }
export function getPolicy(slug, client = apiClient) { return client.request(`/policies/${encodeURIComponent(slug)}`) }
