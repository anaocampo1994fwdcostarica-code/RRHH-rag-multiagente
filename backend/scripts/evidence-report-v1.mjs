// Evidencia: compara el reporte diario GUARDADO de hoy (daily_hr_reports) con la consulta V1 del seed,
// ejecutada en el mismo momento (solo lectura). Escribe docs/evidencias/reporte_diario_vs_v1_<fecha>.md.
// No incluye datos personales (sin listas de personas ni preguntas) ni credenciales.
// Uso: node scripts/evidence-report-v1.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { connectHarnessAdmin } from './lib/harnessAdmin.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const seed = readFileSync(`${root}supabase/seeds/demo_data.sql.example`, 'utf8')
const v1Sql = seed.slice(seed.indexOf('-- V1.'), seed.indexOf('-- V2.'))

const client = await connectHarnessAdmin()
let failed = false
try {
  await client.query('begin read only')
  const { rows: [ctx] } = await client.query(`select (now() at time zone 'America/Costa_Rica')::date::text as today,
    to_char(now() at time zone 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') as now_cr,
    (select count(*) from public.employees where deleted_at is null)::int as employees`)
  const v1 = Object.fromEntries((await client.query(v1Sql)).rows.map((r) => [r.metric, r.value]))
  const { rows: [report] } = await client.query(
    `select metrics, narrative, to_char(generated_at at time zone 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') as generated_cr
     from public.daily_hr_reports where report_date = $1::date and status = 'generated'`, [ctx.today])
  await client.query('rollback')
  if (!report) throw new Error(`No hay reporte guardado para ${ctx.today}. Corre npm run report:daily.`)
  const m = report.metrics

  const pairs = [
    ['Ausentes hoy con permiso aprobado', 'absences.approved_leave_people', m.absences.approved_leave_people, v1.ausentes_hoy_por_permiso_aprobado],
    ['Incapacidades activas hoy', 'sick_leaves.active', m.sick_leaves.active, v1.incapacidades_activas_hoy],
    ['Solicitudes pendientes', 'requests.pending_total', m.requests.pending_total, v1.solicitudes_pendientes],
    ['Pendientes con más de 3 días', 'requests.pending_over_3_days', m.requests.pending_over_3_days, v1.solicitudes_pendientes_mas_de_3_dias],
    ['Ingresos del mes', 'turnover.hires_month', m.turnover.hires_month, v1.ingresos_del_mes],
    ['Salidas del mes', 'turnover.exits_month', m.turnover.exits_month, v1.salidas_del_mes],
    ['Personas con más de 20 días acumulados', 'vacation_over_20.count', m.vacation_over_20.count, v1.personas_con_mas_de_20_dias_acumulados],
  ]
  const rows = pairs.map(([label, path, value, expected]) => {
    const ok = String(value) === String(expected)
    if (!ok) failed = true
    return `| ${label} | \`${path}\` | ${value} | ${expected} | ${ok ? 'Sí' : '**NO**'} |`
  })
  const safe = { ...m, requests: { ...m.requests, pending_list: `[${m.requests.pending_list.length} filas omitidas]` },
    vacation_over_20: { ...m.vacation_over_20, people: `[${m.vacation_over_20.people.length} personas omitidas]` },
    topics: { ...m.topics, unanswered: `[${m.topics.unanswered.length} preguntas omitidas]` } }

  const md = `# Reporte diario vs. V1 del seed — ${ctx.today}

Generado: ${ctx.now_cr} (hora de Costa Rica) · Proyecto de pruebas \`bxtetlzjlgoezxcjhdrw\`.

- Reporte comparado: fila de \`daily_hr_reports\` del ${ctx.today}, generada ${report.generated_cr} por \`npm run report:daily\`
  (funciones SQL de las migraciones \`20261122090000\` y \`20261122100000\`).
- V1: consulta "V1" de \`supabase/seeds/demo_data.sql.example\`, ejecutada en el mismo momento (transacción de solo lectura).
- Colaboradores en la base (deleted_at nulo): ${ctx.employees} (los 56 del seed; V1 filtra DEMO-* y RLS-TEST-EMP-*, las funciones no filtran).

## Comparación

| Métrica | Campo del reporte | Reporte | V1 | ¿Coincide? |
|---|---|---|---|---|
${rows.join('\n')}

**Resultado: ${failed ? 'HAY DIFERENCIAS' : 'las 7 métricas comparables coinciden'}.**

Métricas del reporte sin equivalente en V1: ausentes por tipo ${JSON.stringify(m.absences.by_type)} (total ${m.absences.total_people} personas),
${m.sick_leaves.accumulated_days_month} días de incapacidad en el mes, rotación del mes ${m.turnover.rate_pct_month} % y acumulada del año ${m.turnover.rate_pct_ytd} %,
chatbot del ${m.chatbot.date}: ${m.chatbot.total} consultas, ${m.chatbot.resolved_without_escalation_pct} % resueltas sin escalar, ${m.chatbot.avg_latency_ms} ms de latencia promedio.
Las consultas del chat anteriores a ${ctx.today} son **sintéticas** (\`supabase/seeds/chat_logs_demo.sql.example\`).

## Resumen ejecutivo guardado (${m.meta.narrative_source === 'llm' ? 'redactado por IA, validado' : 'plantilla automática'} · prompt ${m.meta.prompt_version})

> ${report.narrative}

## JSON del reporte (sin datos personales)

\`\`\`json
${JSON.stringify(safe, null, 2)}
\`\`\`
`
  mkdirSync(`${root}docs/evidencias`, { recursive: true })
  const file = `${root}docs/evidencias/reporte_diario_vs_v1_${ctx.today}.md`
  writeFileSync(file, md)
  console.log(rows.join('\n'))
  console.log(`\n${failed ? 'HAY DIFERENCIAS' : 'Todo coincide'} · evidencia: docs/evidencias/reporte_diario_vs_v1_${ctx.today}.md`)
} finally {
  await client.end()
  process.exitCode = failed ? 1 : 0
}
