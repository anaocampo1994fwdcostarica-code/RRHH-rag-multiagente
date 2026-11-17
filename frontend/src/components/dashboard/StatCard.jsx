function StatCard({ label, value, description, accent, icon }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p></div><span className={`flex size-8 items-center justify-center rounded-md text-sm ${accent}`} aria-hidden="true">{icon}</span></div><p className="mt-2 text-[11px] text-slate-400">{description}</p></article>
}

export default StatCard
