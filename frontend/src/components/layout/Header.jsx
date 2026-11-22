import { useState } from 'react'
import { useAuth } from '../../auth/authContext.js'

function Header({ title, subtitle }) {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const initials = (user?.email ?? 'U').slice(0, 2).toUpperCase()
  const logout = async () => { setSigningOut(true); setError(''); try { await signOut() } catch (signOutError) { setError(signOutError.message) } finally { setSigningOut(false) } }
  return <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><nav aria-label="Ruta de navegación" className="text-xs font-medium text-slate-500">Portal RRHH <span aria-hidden="true" className="px-1">/</span> {title}</nav><h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{title}</h1><p className="mt-0.5 text-sm text-slate-500">{subtitle}</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"><div className="flex size-8 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700" aria-hidden="true">{initials}</div><div className="pr-1 text-sm leading-tight"><p className="max-w-40 truncate font-medium text-slate-700">{user?.email ?? 'Sesión activa'}</p><button type="button" disabled={signingOut} onClick={logout} className="text-xs text-[#0f4c5c] hover:underline disabled:opacity-50">{signingOut ? 'Cerrando…' : 'Cerrar sesión'}</button></div></div></div></div>{error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}</header>
}

export default Header
