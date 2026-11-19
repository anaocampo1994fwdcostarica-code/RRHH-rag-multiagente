import { apiClient } from '../../api/client.js'

function query(filters) {
  const parameters = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') parameters.set(key, String(value)) })
  const value = parameters.toString()
  return value ? `?${value}` : ''
}

export function getRequestsManagePermission(client = apiClient) {
  return client.request('/auth/permissions/requests-manage')
}

export function listAdminLeaveRequests(filters, client = apiClient) {
  return client.request(`/admin/leave-requests${query(filters)}`)
}

export function getAdminLeaveRequest(id, client = apiClient) {
  return client.request(`/admin/leave-requests/${encodeURIComponent(id)}`)
}
