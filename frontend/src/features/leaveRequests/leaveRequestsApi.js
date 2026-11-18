import { apiClient } from '../../api/client.js'

function query(filters) {
  const parameters = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') parameters.set(key, String(value)) })
  const value = parameters.toString()
  return value ? `?${value}` : ''
}

export function listLeaveRequests(filters, client = apiClient) { return client.request(`/leave-requests${query(filters)}`) }
export function getLeaveRequest(id, client = apiClient) { return client.request(`/leave-requests/${encodeURIComponent(id)}`) }
export function listLeaveTypes(filters = {}, client = apiClient) { return client.request(`/leave-types${query(filters)}`) }
export function createLeaveRequest(payload, client = apiClient) { return client.request('/leave-requests', { method: 'POST', body: payload }) }
