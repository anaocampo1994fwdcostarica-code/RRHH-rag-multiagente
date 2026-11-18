import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from './authContext.js'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (!email.trim() || !password) { setError('Ingresa correo y contraseña.'); return }
    setSubmitting(true); setError('')
    try { await signIn({ email: email.trim(), password }); navigate(location.state?.from ?? '/', { replace: true }) } catch (authError) { setError(authError.message) } finally { setSubmitting(false) }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-[#0f4c5c] text-sm font-bold text-white">RH</div><div><p className="font-semibold text-slate-900">Portal RRHH</p><p className="text-xs text-slate-500">RAG Multiagente</p></div></div><h1 className="mt-7 text-2xl font-semibold text-slate-900">Iniciar sesión</h1><p className="mt-2 text-sm text-slate-600">Usa tus credenciales institucionales autorizadas.</p><form onSubmit={submit} className="mt-6 space-y-5">{error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<label className="block"><span className="mb-1 block text-sm font-medium">Correo electrónico</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label><label className="block"><span className="mb-1 block text-sm font-medium">Contraseña</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label><button type="submit" disabled={submitting} className="w-full rounded-lg bg-[#0f4c5c] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{submitting ? 'Ingresando…' : 'Ingresar'}</button></form></section></main>
}

export default LoginPage
