import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { es } from 'date-fns/locale/es'
import { dateKey, displayDate, parseDateKey } from './datePickerUtils.js'

function DatePicker({ id, label, value, onChange, min, max, disabledDates = [], availableDates = [], range = false, placeholder = 'Seleccionar fecha', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = range ? { from: parseDateKey(value?.from), to: parseDateKey(value?.to) } : parseDateKey(value)
  const disabled = [{ before: parseDateKey(min) }, { after: parseDateKey(max) }, ...disabledDates.map(parseDateKey).filter(Boolean)].filter((item) => item.before || item.after || item instanceof Date)
  const modifiers = availableDates.length ? { disponible: availableDates.map(parseDateKey).filter(Boolean) } : undefined
  useEffect(() => { const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }; const escape = (event) => { if (event.key === 'Escape') setOpen(false) }; document.addEventListener('mousedown', close); document.addEventListener('keydown', escape); return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) } }, [])
  const select = (next) => { if (range) onChange({ from: next?.from ? dateKey(next.from) : '', to: next?.to ? dateKey(next.to) : '' }); else if (next) { onChange(dateKey(next)); setOpen(false) } }
  const labelText = range ? (value?.from && value?.to ? `${displayDate(value.from)} – ${displayDate(value.to)}` : value?.from ? `${displayDate(value.from)} – elegir fin` : placeholder) : value ? displayDate(value) : placeholder
  return <div ref={ref} className={`relative ${className}`}><label htmlFor={id} className="block text-sm font-semibold text-slate-700">{label}</label><button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${labelText}`} onClick={() => setOpen((current) => !current)} className="mt-1 flex min-h-11 w-full min-w-[232px] items-center justify-between gap-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none transition hover:border-[#0f4c5c] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-1"><span className="min-w-0 flex-1 whitespace-nowrap">{labelText}</span><span aria-hidden="true" className="shrink-0 text-base leading-none text-[#0f4c5c]">▣</span></button>{open && <div role="dialog" aria-label={`Calendario: ${label}`} className="absolute z-50 mt-2 min-w-[300px] rounded-xl border border-[#ede8e0] bg-white p-3 shadow-[0_14px_32px_rgba(36,50,58,0.18)]"><DayPicker mode={range ? 'range' : 'single'} selected={selected} onSelect={select} locale={es} weekStartsOn={1} disabled={disabled} modifiers={modifiers} modifiersClassNames={{ disponible: 'day-available' }} formatters={{ formatWeekdayName: (date) => ['D', 'L', 'M', 'X', 'J', 'V', 'S'][date.getDay()] }} showOutsideDays={false} /></div>}</div>
}

export default DatePicker
