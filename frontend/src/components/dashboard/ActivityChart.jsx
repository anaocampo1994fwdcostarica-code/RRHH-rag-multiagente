const events = [
  { time: '08:00', title: 'Revisión de solicitudes', detail: 'Bandeja interna', color: 'bg-sky-500', gridColumn: '1 / span 2', gridRow: '1' },
  { time: '10:00', title: 'Consulta de políticas', detail: 'Orientación documental', color: 'bg-teal-500', gridColumn: '2 / span 2', gridRow: '2' },
  { time: '13:30', title: 'Actualización documental', detail: 'Catálogo de muestra', color: 'bg-violet-500', gridColumn: '4 / span 2', gridRow: '3' },
]

const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']

function ActivityChart() {
  return (
    <section aria-labelledby="activity-title" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="activity-title" className="text-sm font-semibold text-slate-800">Actividad de Recursos Humanos</h2>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-800">Demostración</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Agenda ilustrativa de trabajo interno</p>
        </div>
        <div className="flex gap-1.5" aria-label="Vistas no disponibles">
          <span className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-400">Línea de tiempo</span>
          <span className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-400">Calendario</span>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div style={{ minWidth: '520px' }}>
          <div className="grid grid-cols-6 border-b border-slate-200 text-center text-[10px] text-slate-400">
            {hours.map((hour) => <span key={hour} className="pb-2">{hour}</span>)}
          </div>
          <div className="mt-2 grid h-28 grid-cols-6 grid-rows-3 gap-x-1 gap-y-1 rounded-md bg-slate-50 p-2" role="img" aria-label="Agenda de demostración con tres actividades ficticias">
            {events.map((event) => (
              <div key={event.title} style={{ gridColumn: event.gridColumn, gridRow: event.gridRow }} className={`min-w-0 rounded px-2 py-1 text-[10px] leading-tight text-white ${event.color}`}>
                <span className="mr-1 font-semibold">{event.time}</span>
                <span className="font-medium">{event.title}</span>
                <span className="block truncate opacity-80">{event.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default ActivityChart
