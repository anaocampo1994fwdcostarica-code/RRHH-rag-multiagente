export function LoadingBlock({ label = 'Cargando…' }) {
  return <p role="status" className="mx-auto max-w-7xl rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">{label}</p>
}

export function ErrorBlock({ message, onRetry }) {
  return <div role="alert" className="mx-auto max-w-7xl rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900"><p>{message}</p>{onRetry ? <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-900 outline-none hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Reintentar</button> : null}</div>
}
