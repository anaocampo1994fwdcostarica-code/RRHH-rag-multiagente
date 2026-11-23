import { useMemo } from 'react'
import { eachDayOfInterval, format, parseISO } from 'date-fns'
import DatePicker from '../../../components/DatePicker.jsx'
import { formatLongDate } from '../reportPresentation.js'

function DateSelector({ value, max, history, onChange }) {
  const availableDates = useMemo(() => (Array.isArray(history) ? history : []).map((day) => day.reportDate).filter(Boolean), [history])
  const unavailableDates = useMemo(() => {
    if (!max || !availableDates.length) return []
    const available = new Set(availableDates)
    return eachDayOfInterval({ start: parseISO('2020-01-01'), end: parseISO(max) }).filter((day) => !available.has(format(day, 'yyyy-MM-dd')))
  }, [availableDates, max])
  const latest = availableDates[0] ?? ''
  return <div className="flex flex-wrap items-end gap-3"><DatePicker id="report-date" label="Fecha del reporte" value={value} min="2020-01-01" max={max} availableDates={availableDates} disabledDates={unavailableDates} onChange={onChange} /><button type="button" onClick={() => onChange(max)} className="mb-0.5 rounded-lg border border-[#0f4c5c] bg-white px-3 py-2.5 text-sm font-semibold text-[#0f4c5c] hover:bg-[#e8f1f3]">Hoy</button><button type="button" disabled={!latest} onClick={() => onChange(latest)} className="mb-0.5 rounded-lg border border-[#d8d0c6] bg-white px-3 py-2.5 text-sm font-semibold text-[#5c3d2e] hover:bg-[#f6f3ee] disabled:opacity-50">Último reporte</button><span className="sr-only">{value ? `Fecha seleccionada: ${formatLongDate(value)}` : 'Sin fecha seleccionada'}</span></div>
}

export default DateSelector
