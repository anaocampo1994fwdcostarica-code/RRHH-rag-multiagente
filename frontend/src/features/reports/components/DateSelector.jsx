import { formatLongDate, formatNumericDate, isValidDateKey } from '../reportPresentation.js'

const control = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-1'

function DateSelector({ value, max, history, onChange }) {
  const days = Array.isArray(history) ? history : []
  return <form onSubmit={(event) => event.preventDefault()} className="grid gap-3 sm:grid-cols-2 sm:max-w-2xl"><div><label htmlFor="report-date" className="text-sm font-medium text-slate-700">Fecha del reporte</label><input id="report-date" type="date" value={value} min="2020-01-01" max={max} onChange={(event) => isValidDateKey(event.target.value) && event.target.value >= '2020-01-01' && event.target.value <= max && onChange(event.target.value)} className={control} /></div><div><label htmlFor="report-day-list" className="text-sm font-medium text-slate-700">Días disponibles</label><select id="report-day-list" value={days.some((day) => day.reportDate === value) ? value : ''} onChange={(event) => event.target.value && onChange(event.target.value)} disabled={!days.length} className={control}><option value="">{days.length ? 'Elegir un día…' : 'Sin reportes previos'}</option>{days.map((day) => <option key={day.reportDate} value={day.reportDate}>{formatNumericDate(day.reportDate)} · {formatLongDate(day.reportDate)}</option>)}</select></div></form>
}

export default DateSelector
