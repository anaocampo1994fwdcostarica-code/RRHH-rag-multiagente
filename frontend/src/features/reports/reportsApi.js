import { apiClient } from '../../api/client.js'
import { isValidDateKey } from './reportPresentation.js'

export function getDailyReport(date, client = apiClient) {
  const query = isValidDateKey(date) ? `?date=${encodeURIComponent(date)}` : ''
  return client.request(`/reports/daily${query}`)
}

export function listReportHistory({ limit = 30 } = {}, client = apiClient) {
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 30
  return client.request(`/reports/daily/history?limit=${safeLimit}`)
}
