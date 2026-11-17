const metrics = [
  { label: 'Empleados', value: '248', detail: 'Registro simulado' },
  { label: 'Solicitudes pendientes', value: '12', detail: 'Dato de demostración' },
  { label: 'Consultas a la IA', value: '86', detail: 'Ejemplo del día' },
  { label: 'Documentos disponibles', value: '34', detail: 'Catálogo de muestra' },
]

function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <section aria-labelledby="overview-title">
        <div className="mb-5 flex items-center gap-2">
          <h2 id="overview-title" className="text-base font-semibold text-slate-800">Resumen general</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Demostración</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{metric.value}</p>
              <p className="mt-2 text-xs text-slate-500">{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="welcome-title" className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <p className="text-sm font-medium text-cyan-700">Portal en preparación</p>
        <h2 id="welcome-title" className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
          Una base central para la gestión de Recursos Humanos
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Este espacio integrará, en próximas etapas, la consulta de políticas, un asistente con IA y fuentes documentales, reportes administrativos y seguimiento de solicitudes. Los indicadores de esta pantalla son únicamente datos simulados para validar el diseño.
        </p>
      </section>
    </div>
  )
}

export default DashboardPage
