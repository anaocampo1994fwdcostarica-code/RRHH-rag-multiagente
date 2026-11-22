import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import app from '../src/app.js'
import { createReportsController } from '../src/controllers/reportsController.js'
import { createRequirePermission } from '../src/middlewares/requirePermission.js'
import { createDailyReportRepository } from '../src/repositories/dailyReportRepository.js'
import { parseHistoryQuery, parseReportDate } from '../src/validation/reports.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
function response() {
  return { statusCode: undefined, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body } }
}
async function call(handler, request) {
  const result = response()
  let error
  await handler(request, result, (nextError) => { error = nextError })
  return { result, error }
}

test('report routes reject requests without a JWT', async () => {
  const server = http.createServer(app)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  try {
    const { port } = server.address()
    for (const path of ['/api/reports/daily', '/api/reports/daily/history', '/api/admin/documents/sync/last']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 401, path)
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('a collaborator without reports.read gets 403 before any data access', async () => {
  const checked = []
  const guard = createRequirePermission('reports.read', { repository: { hasPermission: async (_auth, permission) => { checked.push(permission); return false } } })
  const { error } = await call(guard, { auth })
  assert.equal(error.statusCode, 403)
  assert.deepEqual(checked, ['reports.read'])
})

test('database permission errors (42501) also become 403, and invalid dates 400', async () => {
  const deny = Object.assign(new Error('Daily report metrics require reports.read.'), { code: '42501' })
  const badDate = Object.assign(new Error('bad'), { code: '22023' })
  const repository = createDailyReportRepository({ transaction: async () => { throw deny } })
  await assert.rejects(repository.getReport(auth, '2026-11-22'), (error) => error.statusCode === 403)
  await assert.rejects(repository.getMetrics(auth), (error) => error.statusCode === 403)
  const invalid = createDailyReportRepository({ transaction: async () => { throw badDate } })
  await assert.rejects(invalid.getMetrics(auth, '2999-01-01'), (error) => error.statusCode === 400)
})

test('GET /reports/daily validates the date, returns 404 without a report and maps the stored report', async () => {
  const requested = []
  const controller = createReportsController({ repository: {
    getReport: async (_auth, date) => { requested.push(date); return date === '2026-11-01' ? null : { report_date: date ?? '2026-11-22', metrics: { a: 1 }, narrative: 'Texto.', generated_at: 't' } },
  } })
  assert.equal((await call(controller.daily, { auth, query: { date: '2026-02-30' } })).error.statusCode, 400)
  assert.equal((await call(controller.daily, { auth, query: { date: '22-11-2026' } })).error.statusCode, 400)
  assert.equal((await call(controller.daily, { auth, query: { date: '2026-11-01' } })).error.statusCode, 404)
  const { result } = await call(controller.daily, { auth, query: {} })
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.body.data, { reportDate: '2026-11-22', generatedAt: 't', narrative: 'Texto.', metrics: { a: 1 }, isLatestFallback: false })
  assert.deepEqual(requested, ['2026-11-01', null])
})

test('GET /reports/daily/history validates limits and maps rows', async () => {
  const controller = createReportsController({ repository: {
    listReports: async (_auth, query) => [{ report_date: '2026-11-22', generated_at: 't', narrative_source: 'llm', absences_total: 8, pending_total: 25, pending_over_3_days: 20, query }],
  } })
  assert.equal((await call(controller.history, { auth, query: { limit: '0' } })).error.statusCode, 400)
  const { result } = await call(controller.history, { auth, query: {} })
  assert.deepEqual(result.body.data[0], { reportDate: '2026-11-22', generatedAt: 't', narrativeSource: 'llm', absencesTotal: 8, pendingTotal: 25, pendingOver3Days: 20 })
  assert.deepEqual(parseHistoryQuery({ limit: '7', before: '2026-11-10' }), { limit: 7, before: '2026-11-10' })
  assert.equal(parseReportDate(undefined), null)
})

test('without a date and without the report of today, GET /reports/daily falls back to the latest report', async () => {
  const controller = createReportsController({ repository: {
    getReport: async (_auth, date) => (date === '2026-11-21' ? { report_date: date, metrics: {}, narrative: 'Ayer.', generated_at: 't' } : null),
    listReports: async () => [{ report_date: '2026-11-21' }],
  } })
  const { result } = await call(controller.daily, { auth, query: {} })
  assert.equal(result.body.data.reportDate, '2026-11-21')
  assert.equal(result.body.data.isLatestFallback, true)
  const empty = createReportsController({ repository: { getReport: async () => null, listReports: async () => [] } })
  assert.equal((await call(empty.daily, { auth, query: {} })).error.statusCode, 404)
})
