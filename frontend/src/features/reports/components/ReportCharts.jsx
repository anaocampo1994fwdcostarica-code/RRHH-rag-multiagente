import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { normalizeTrend } from '../reportPresentation.js'

const COLORS = { absences: '#0f4c5c', chat: '#b45309', vacaciones: '#0f4c5c', permiso: '#b45309', incapacidad: '#9f1239' }
const axisTick = { fontSize: 12, fill: '#475569' }

function ChartCard({ id, title, description, children, empty, height = 288 }) {
  return <figure aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><figcaption><h3 id={`${id}-title`} className="font-semibold text-slate-900">{title}</h3><p id={`${id}-desc`} className="mt-1 text-sm text-slate-600">{description}</p></figcaption>{empty ? <p className="mt-6 rounded-md bg-slate-50 p-6 text-center text-sm text-slate-600">No hay datos para mostrar.</p> : <div className="mt-4 w-full" style={{ height }} role="img" aria-label={description}>{children}</div>}</figure>
}

export function TrendChart({ trend }) {
  const data = normalizeTrend(trend)
  const totalAbsences = data.reduce((sum, point) => sum + point.absences, 0)
  const totalQueries = data.reduce((sum, point) => sum + (point.chat_queries ?? 0), 0)
  const incompleteDay = data.some((point) => point.chat_queries === null)
  return <ChartCard id="trend" title="Tendencia de 30 días" empty={!data.length} description={`Ausencias y consultas al asistente por día. Total del periodo: ${totalAbsences} ausencias y ${totalQueries} consultas.${incompleteDay ? ' El último día no tiene el dato de consultas porque aún está en curso.' : ''}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" minTickGap={24} /><YAxis yAxisId="absences" allowDecimals={false} tick={{ ...axisTick, fill: COLORS.absences }} /><YAxis yAxisId="chat" orientation="right" allowDecimals={false} tick={{ ...axisTick, fill: COLORS.chat }} /><Tooltip /><Legend /><Line yAxisId="absences" type="linear" dataKey="absences" name="Ausencias" stroke={COLORS.absences} strokeWidth={2} dot={false} /><Line yAxisId="chat" type="linear" dataKey="chat_queries" name="Consultas al asistente" stroke={COLORS.chat} strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></ChartCard>
}

export function DepartmentChart({ departments }) {
  const data = Array.isArray(departments) ? departments : []
  const height = Math.max(288, data.length * 44)
  return <ChartCard id="departments" height={height} title="Ausencias por departamento" empty={!data.length} description={`Ausencias del día por departamento, separadas en vacaciones, permiso e incapacidad. ${data.map((d) => `${d.department}: ${d.total}`).join('; ')}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, bottom: 0, left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={axisTick} /><YAxis type="category" dataKey="department" width={110} tick={axisTick} /><Tooltip /><Legend /><Bar dataKey="vacaciones" name="Vacaciones" stackId="a" fill={COLORS.vacaciones} /><Bar dataKey="permiso" name="Permiso" stackId="a" fill={COLORS.permiso} /><Bar dataKey="incapacidad" name="Incapacidad" stackId="a" fill={COLORS.incapacidad} /></BarChart></ResponsiveContainer></ChartCard>
}
