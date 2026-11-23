import { getAccessToken, handleUnauthorized } from './session.js'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function getApiBaseUrl() {
  return import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:3001/api'
}

function getSafeErrorMessage(status, payload) {
  if (status === 401) return 'La sesión es requerida o expiró.'
  if (status === 403) return 'No tienes permisos para realizar esta operación.'
  if (status === 404) return 'El recurso no está disponible.'
  if (status === 409) return 'La solicitud no se puede completar por un conflicto.'
  if (status === 503) return 'Un servicio requerido no está disponible temporalmente.'
  if (status >= 500) return 'No fue posible completar la solicitud.'
  if (typeof payload?.error === 'string' && payload.error.length <= 120) return payload.error
  return 'No fue posible completar la solicitud.'
}

function getCookie(name) {
  if (typeof document === 'undefined') return undefined
  return document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function createApiClient({ baseUrl = getApiBaseUrl(), fetchImpl = fetch, getToken = getAccessToken } = {}) {
  async function request(path, { method = 'GET', body } = {}) {
    const token = await getToken()
    if (typeof token !== 'string' || !token.trim()) throw new ApiError(401, 'La sesión es requerida o expiró.')

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && getCookie('csrf') ? { 'X-CSRF-Token': getCookie('csrf') } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    let payload
    try { payload = await response.json() } catch { /* Responses without JSON use a safe generic error. */ }
    if (!response.ok) {
      if (response.status === 401) await handleUnauthorized()
      throw new ApiError(response.status, getSafeErrorMessage(response.status, payload))
    }
    return payload
  }
  return { request }
}

export const apiClient = createApiClient()
