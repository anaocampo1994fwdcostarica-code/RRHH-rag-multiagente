function StatCard({ label, value, description, accent, icon, title }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" title={title}><div className="flex items-start justify-between"><div><h3 className="text-xs font-medium text-slate-600">{label}</h3><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p></div><span className={`flex size-8 items-center justify-center rounded-md text-sm ${accent}`} aria-hidden="true">{icon}</span></div><div className="mt-2 space-y-0.5 text-xs text-slate-600">{description}</div></article>
}

export default StatCard
