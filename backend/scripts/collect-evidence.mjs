// Paquete reproducible de evidencia. Solo ejecuta lecturas: Drive, SQL SELECT y Get-ScheduledTask.
import '../src/config/env.js'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createGoogleDriveClient, supportedMimeTypes } from '../src/rag/googleDriveClient.js'
import { resolveIngestIdentity, transaction, closeScriptPool } from './lib/ragScriptContext.mjs'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
const evidenceDir = `${root}docs/evidencias/`
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const typeNames = { 'application/vnd.google-apps.document': 'Google Doc', 'application/vnd.google-apps.spreadsheet': 'Google Sheets', 'application/pdf': 'PDF' }
const esc = (value) => String(value ?? '—').replace(/[|\r\n]/g, (char) => char === '|' ? '\\|' : ' ')
const safeError = (error) => error?.code ?? error?.response?.status ?? 'error de lectura'

async function collectDrive() {
  try {
    const drive = createGoogleDriveClient({ retries: 0 })
    const files = await drive.listFiles({ includeUnsupported: true })
    const rows = await Promise.all(files.map(async (file) => {
      let legible
      if (supportedMimeTypes.has(file.mimeType)) {
        try { if (file.mimeType === 'application/pdf') await drive.downloadPdf(file.id); else if (file.mimeType === 'application/vnd.google-apps.document') await drive.exportGoogleDoc(file.id); else await drive.readGoogleSheet(file.id); legible = 'sí' } catch (error) { legible = `no (${safeError(error)})` }
      } else legible = 'no (tipo no soportado)'
      return { nombre: file.name, tipo: typeNames[file.mimeType] ?? file.mimeType, legible }
    }))
    return { status: 'ok', rows }
  } catch (error) { return { status: `no disponible (${safeError(error)})`, rows: [] } }
}

async function collectSql() {
  const auth = await resolveIngestIdentity()
  return transaction(auth, async (client) => {
    const policies = (await client.query(`select document_code, title, category, doc_version, revision, effective_from::text as effective_from, drive_url, published_at from public.list_published_policies() order by document_code`)).rows
    const movements = (await client.query(`select min(movement_date)::text as minimum, max(movement_date)::text as maximum, count(*)::int as total, count(distinct date_trunc('month', movement_date))::int as months from public.personnel_movements`)).rows[0]
    const employees = (await client.query(`select count(*)::int as total from public.employees where deleted_at is null and (employee_code like 'DEMO-%' or employee_code in ('RLS-TEST-EMP-A','RLS-TEST-EMP-B'))`)).rows[0].total
    const logs = (await client.query(`select prompt_version, count(*)::int as total from public.chat_query_logs group by prompt_version order by prompt_version`)).rows
    const sync = (await client.query(`select * from public.get_last_document_sync_run()`)).rows[0] ?? null
    return { policies, movements, employees, logs, sync }
  })
}

async function scheduledTasks() {
  try { const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', "Get-ScheduledTask -TaskName 'RRHH-RAG*' -ErrorAction SilentlyContinue | Select-Object TaskName,State,LastRunTime,NextRunTime | ConvertTo-Json -Compress"], { windowsHide: true }); return stdout.trim() || 'No se encontraron tareas RRHH-RAG.' } catch (error) { return `No disponible (${safeError(error)})` }
}

async function latestEvaluation() {
  const files = (await readdir(evidenceDir)).filter((name) => /^hoja_evaluacion_45_\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort().reverse()
  if (!files.length) return 'No se encontró una hoja oficial.'
  const text = await readFile(`${evidenceDir}${files[0]}`, 'utf8')
  return [`Archivo: ${files[0]}`, ...text.split(/\r?\n/).filter((line) => /Aciertos|Con cita|< 8 s|p90|Fall/.test(line)).slice(0, 12)].join('\n')
}

const drive = await collectDrive()
let sql
try { sql = await collectSql() } catch (error) { sql = { error: `No disponible (${safeError(error)})`, policies: [], logs: [] } }
const tasks = await scheduledTasks()
const evaluation = await latestEvaluation()
const domainMap = { 'POL-RH-01': 'Vacaciones y feriados', 'POL-RH-02': 'Permisos', 'PRO-RH-03': 'Incapacidades', 'REG-RH-04': 'Jornada y teletrabajo', 'POL-RH-05': 'Remuneración', 'CAT-RH-06': 'Beneficios', 'MAN-RH-07': 'Ingreso y salida', 'POL-RH-08': 'Desempeño', 'COD-RH-09': 'Conducta', 'AVI-RH-10': 'Privacidad' }
const policyRows = Object.entries(domainMap).map(([code, domain]) => { const row = sql.policies?.find((item) => item.document_code === code); return `| ${domain} | ${code} | ${esc(row?.title)} | ${esc(row ? 'Drive / catálogo' : 'no encontrado')} | ${esc(row?.doc_version ?? row?.revision)} | ${esc(row?.effective_from)} | ${esc(row?.published_at ? 'sí' : 'no')} | ${row?.drive_url ? 'enlace presente' : 'sin enlace'} |` }).join('\n')
const logRows = (sql.logs ?? []).map((row) => `| ${esc(row.prompt_version)} | ${row.prompt_version === 'demo-seed' ? 'sintéticas' : 'reales/otra fuente'} | ${row.total} |`).join('\n') || '| — | — | 0 |'
const driveRows = drive.rows.map((row) => `| ${esc(row.nombre)} | ${esc(row.tipo)} | ${esc(row.legible)} |`).join('\n') || '| — | — | — |'
const report = [`# Paquete de evidencia — ${date}`, '', 'Generado por backend/scripts/collect-evidence.mjs. Solo contiene lecturas y omite IDs de Drive, correos, claves y tokens.', '', '## Drive', '', `Estado: ${drive.status}`, '', '| Nombre | Tipo | Legible |', '|---|---|---|', driveRows, '', `Total observado: ${drive.rows.length}; legibles: ${drive.rows.filter((row) => row.legible === 'sí').length}.`, '', '## Dominio del enunciado → documento', '', '| Dominio | Código | Título | Formato/fuente | Versión | Vigencia | Published | Enlace |', '|---|---|---|---|---|---|---|---|', policyRows, '', '## Movimientos y colaboradores', '', '| Mínimo | Máximo | Total movimientos | Meses distintos | Colaboradores seed + A/B |', '|---|---|---:|---:|---:|', `| ${esc(sql.movements?.minimum)} | ${esc(sql.movements?.maximum)} | ${esc(sql.movements?.total)} | ${esc(sql.movements?.months)} | ${esc(sql.employees)} |`, '', '## chat_query_logs', '', '| prompt_version | Clasificación | Total |', '|---|---|---:|', logRows, '', '## Tareas programadas', '', 'Get-ScheduledTask -TaskName RRHH-RAG*:', '', '~~~text', tasks, '~~~', '', '## Último document_sync_runs', '', sql.sync ? `Estado: ${esc(sql.sync.status ?? sql.sync.run_status)}; inicio: ${esc(sql.sync.started_at)}; fin: ${esc(sql.sync.finished_at)}; resultado: ${esc(sql.sync.summary ?? sql.sync.result)}` : 'No disponible.', '', '## Última hoja de evaluación oficial', '', evaluation, '', '## Limitaciones de esta corrida', '', sql.error ? `- SQL no disponible: ${sql.error}` : '- Lectura SQL completada.', '- Las credenciales y los identificadores sensibles se omiten deliberadamente.', ''].join('\n')
await mkdir(evidenceDir, { recursive: true })
await writeFile(`${evidenceDir}paquete_evidencia_${date}.md`, report, 'utf8')
await closeScriptPool().catch(() => {})
console.log(`Paquete generado: docs/evidencias/paquete_evidencia_${date}.md`)
