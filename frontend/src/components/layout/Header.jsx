function Header({ title, subtitle }) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
        <div className="flex size-9 items-center justify-center rounded-full bg-cyan-100 text-sm font-semibold text-cyan-800" aria-hidden="true">
          AD
        </div>
        <div className="text-sm leading-tight">
          <p className="font-medium text-slate-800">Ana Demo</p>
          <p className="text-xs text-slate-500">Usuario ficticio</p>
        </div>
      </div>
    </header>
  )
}

export default Header
