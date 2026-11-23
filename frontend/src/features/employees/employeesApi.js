import { apiClient } from '../../api/client.js'
const query = (filters) => { const p = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) }); return p.toString() ? `?${p}` : '' }
export const listEmployees = (filters, client = apiClient) => client.request(`/employees${query(filters)}`)
export const getEmployee = (id, client = apiClient) => client.request(`/employees/${encodeURIComponent(id)}`)
export const checkPermission = (permission, client = apiClient) => client.request(`/auth/permissions/${encodeURIComponent(permission)}`)
