import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../..', import.meta.url)
const migrationUrl = new URL('supabase/migrations/20261121090000_add_data_agent_functions.sql', root)
const statusUrl = new URL('supabase/manual_checks/20261119_migration_status_readonly.sql', root)
const FUNCTIONS = [
  ['get_my_vacation_balance', '()'],
  ['get_my_next_payment', '()'],
  ['get_my_next_review', '()'],
  ['get_my_requests', '(date, integer, text, text)'],
  ['get_my_sick_leaves', '(boolean)'],
  ['get_absences_today_summary', '()'],
]

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0, `falta ${name}`)
  return sql.slice(start, sql.indexOf('$$;', start))
}

test('las funciones del agente de datos son SECURITY INVOKER, STABLE, con search_path fijo y sin identidad como parámetro', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const code = sql.replace(/--.*$/gm, '')
  for (const [name, signature] of FUNCTIONS) {
    const body = functionBody(code, name)
    assert.match(body, /\bstable\b/, name)
    assert.match(body, /security invoker/, name)
    assert.doesNotMatch(body, /security definer/, name)
    assert.match(body, /set search_path = pg_catalog, public, pg_temp/, name)
    assert.match(body, /\(now\(\) at time zone 'America\/Costa_Rica'\)::date/, name)
    const header = body.slice(0, body.indexOf(')') + 1)
    assert.doesNotMatch(header, /employee|code|name|email|profile/i, `${name} no debe recibir identidad`)
    assert.ok(code.includes(`revoke all on function public.${name}${signature} from public, anon, authenticated, service_role;`), `revoke ${name}`)
    assert.ok(code.includes(`grant execute on function public.${name}${signature} to authenticated;`), `grant ${name}`)
  }
  for (const name of FUNCTIONS.map(([fn]) => fn).filter((fn) => fn.startsWith('get_my_'))) {
    assert.match(functionBody(code, name), /current_employee_id\(\)/, name)
  }
  const summary = functionBody(code, 'get_absences_today_summary')
  assert.match(summary, /has_permission\('employees\.read'\) or public\.has_permission\('reports\.read'\)/)
  assert.match(summary, /errcode = '42501'/)
  assert.doesNotMatch(code, /current_date/)
  assert.doesNotMatch(code, /grant execute[^;]*\bto\b[^;]*\b(anon|public)\b/, 'EXECUTE nunca se concede a anon ni a PUBLIC')
})

test('el archivo de estado incluye la migración de funciones del agente de datos', async () => {
  const status = await readFile(statusUrl, 'utf8')
  assert.match(status, /20261121090000_add_data_agent_functions/)
  for (const [name] of FUNCTIONS) assert.ok(status.includes(`'${name}'`), name)
})
