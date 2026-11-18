import { Navigate, useLocation } from 'react-router'
import { useAuth } from './authContext.js'
import { getRouteAccess } from './routeAccess.js'

export function SessionLoading() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><p className="rounded-lg bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">Restaurando sesión…</p></main>
}

export function ProtectedRoute({ children }) {
  const { status, user } = useAuth()
  const location = useLocation()
  const access = getRouteAccess(status, user)
  if (access === 'loading') return <SessionLoading />
  if (access === 'redirect-login') return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />
  return children
}

export function PublicOnlyRoute({ children }) {
  const { status, user } = useAuth()
  const access = getRouteAccess(status, user)
  if (access === 'loading') return <SessionLoading />
  if (access === 'allow') return <Navigate to="/" replace />
  return children
}
