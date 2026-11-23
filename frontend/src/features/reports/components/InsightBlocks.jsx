import { formatDateTimeCostaRica, formatDays, formatCount, getNarrativeSourceLabel } from '../reportPresentation.js'

const card = 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm'

export function ExecutiveSummary({ narrative, source }) {
  const label = getNarrativeSourceLabel(source)
  return <section aria-labelledby="summary-title" className={card}><div className="flex flex-wrap items-center gap-2"><h3 id="summary-title" className="font-semibold text-slate-900">Resumen ejecutivo</h3>{label ? <span className="rounded-full bg-[#e8f1f3] px-2.5 py-0.5 text-xs font-medium text-[#0f4c5c]">{label}</span> : null}</div>{narrative ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{narrative}</p> : <p className="mt-3 text-sm text-slate-600">Este reporte no incluye resumen.</p>}</section>
}

export function TopTopics({ topics }) {
  const list = Array.isArray(topics?.top5) ? topics.top5 : []
  return <section aria-labelledby="topics-title" className={card}><h3 id="topics-title" className="font-semibold text-slate-900">Temas más consultados</h3>{list.length ? <ol className="mt-3 space-y-2 text-sm">{list.map((item, index) => <li key={item.topic} className="flex items-center justify-between gap-3"><span className="text-slate-700">{index + 1}. {item.topic}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">{formatCount(item.count)}</span></li>)}</ol> : <p className="mt-3 text-sm text-slate-600">Sin consultas registradas.</p>}</section>
}

export function UnansweredQuestions({ topics }) {
  const list = Array.isArray(topics?.unanswered) ? topics.unanswered : []
  return <section aria-labelledby="unanswered-title" className={card}><h3 id="unanswered-title" className="font-semibold text-slate-900">Preguntas sin respuesta <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">{formatCount(topics?.unanswered_count ?? list.length)}</span></h3>{list.length ? <ul className="mt-3 space-y-3 text-sm">{list.map((item, index) => <li key={`${item.asked_at}-${index}`}><p className="text-slate-800">{item.question}</p><p className="text-xs text-slate-600">{formatDateTimeCostaRica(item.asked_at)}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No hubo preguntas sin respuesta.</p>}</section>
}

export function VacationOver20({ data }) {
  const people = Array.isArray(data?.people) ? data.people : []
  return <section aria-labelledby="vacation-title" className={card}><h3 id="vacation-title" className="font-semibold text-slate-900">Más de 20 días de vacaciones <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">{formatCount(data?.count ?? people.length)}</span></h3>{people.length ? <ul className="mt-3 space-y-3 text-sm">{people.map((person) => <li key={person.employee_code} className="flex items-start justify-between gap-3"><span><span className="font-medium text-slate-800">{person.employee_name}</span><span className="block text-xs text-slate-600">{person.employee_code} · {person.department}</span></span><span className="whitespace-nowrap text-slate-700">{formatDays(person.accumulated_days)}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">Nadie supera los 20 días acumulados.</p>}</section>
}
