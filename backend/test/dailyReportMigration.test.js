import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync(new URL('../../supabase/migrations/20261122090000_add_daily_report_functions.sql', import.meta.url), 'utf8')
const code = sql.replace(/--.*$/gm, '')

function functionBody(name) {
  const start = code.indexOf(`create or replace function ${name}(`)
  assert.notEqual(start, -1, `${name} is defined`)
  const end = code.indexOf('$$;', code.indexOf('$$', start) + 2)
  return code.slice(start, end)
}

const readers = {
  'public.get_daily_report_metrics': ['date', 'reports.read'],
  'public.get_hr_trend_30d': ['date', 'reports.read'],
  'public.get_daily_report': ['date', 'reports.read'],
  'public.list_daily_reports': ['integer, date', 'reports.read'],
  'public.list_drive_documents': ['', 'documents.manage'],
  'public.get_last_document_sync_run': ['', 'documents.manage'],
}

test('read functions are SECURITY INVOKER, STABLE, have a fixed search_path and check the permission (42501)', () => {
  for (const [name, [, permission]] of Object.entries(readers)) {
    const body = functionBody(name)
    assert.match(body, /security invoker/, name)
    assert.match(body, /\bstable\b/, name)
    assert.match(body, /set search_path = pg_catalog, public, pg_temp/, name)
    assert.ok(body.includes(`public.has_permission('${permission}')`), name)
    assert.match(body, /errcode = '42501'/, name)
  }
})

test('"today" is always Costa Rica time, never current_date', () => {
  assert.equal(/current_date/.test(code), false)
  assert.ok(functionBody('public.get_daily_report_metrics').includes("now() at time zone 'America/Costa_Rica'"))
  assert.ok(functionBody('public.get_hr_trend_30d').includes("now() at time zone 'America/Costa_Rica'"))
})

test('metrics cover the 7 SQL blocks and document the turnover formula', () => {
  const body = functionBody('public.get_daily_report_metrics')
  for (const key of ['absences', 'requests', 'pending_over_3_days', 'sick_leaves', 'accumulated_days_month', 'turnover', 'rate_pct_ytd', 'formula', 'vacation_over_20', 'chatbot', 'resolved_without_escalation_pct', 'avg_latency_ms', 'topics', 'top5', 'unanswered', 'basis']) {
    assert.ok(body.includes(`'${key}'`), key)
  }
})

test('read functions are executable only by authenticated', () => {
  for (const [name, [args]] of Object.entries(readers)) {
    assert.ok(code.includes(`revoke all on function ${name}(${args}) from public, anon, authenticated, service_role;`), name)
    assert.ok(code.includes(`grant execute on function ${name}(${args}) to authenticated;`), name)
  }
})

test('only rrhh_api can save reports, through a SECURITY DEFINER upsert that checks the author', () => {
  const body = functionBody('app_private.save_daily_hr_report')
  assert.match(body, /security definer/)
  assert.match(body, /on conflict \(report_date\) do update/)
  assert.match(body, /p\.code = 'reports\.read'/)
  assert.match(body, /admin_audit_log/)
  assert.ok(code.includes('revoke all on function app_private.save_daily_hr_report(date, jsonb, text, uuid) from public, anon, authenticated, service_role;'))
  assert.ok(code.includes('grant execute on function app_private.save_daily_hr_report(date, jsonb, text, uuid) to rrhh_api;'))
  assert.equal(/grant execute on function app_private\.save_daily_hr_report[^;]*to (authenticated|anon|public|service_role)/.test(code), false)
  assert.match(code, /revoke insert, update, delete on public\.daily_hr_reports from authenticated;/)
  assert.match(code, /drop policy if exists reports_manage_staff on public\.daily_hr_reports;/)
})

test('the fixes migration adds the policy catalog and tightens report generation', () => {
  const fixes = readFileSync(new URL('../../supabase/migrations/20261122100000_policies_catalog_and_report_fixes.sql', import.meta.url), 'utf8')
  assert.match(fixes, /create or replace function public\.list_published_policies\(\)[\s\S]*security definer[\s\S]*p\.status = 'published' and p\.archived_at is null/)
  assert.ok(fixes.includes('grant execute on function public.list_published_policies() to authenticated;'))
  assert.ok(fixes.includes("public.has_permission('employees.read') and public.has_permission('requests.manage')"))
  assert.ok(fixes.includes('[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
  assert.ok(fixes.includes('case when days.d >= v_today then null'))
  assert.ok(fixes.includes('revoke insert, update, delete on public.daily_hr_reports from service_role;'))
  assert.equal((fixes.match(/^as \$\$$/gm) ?? []).length, (fixes.match(/^\$\$;$/gm) ?? []).length)
})
