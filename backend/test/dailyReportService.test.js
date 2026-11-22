import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, createDailyReportService, todayInCostaRica } from '../src/services/dailyReportService.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })

function fakeRepository({ failOn = 'never' } = {}) {
  const saved = new Map()
  return {
    saved,
    async getMetrics(_auth, date) {
      if (date === failOn) throw new Error('boom')
      return { report_date: date ?? '2026-11-22', meta: { basis: { absences: 'historica' } }, absences: { total_people: 1 } }
    },
    async getTrend(_auth, date) { return [{ day: date, absences: 1, chat_queries: 0 }] },
    async save(_auth, report) { saved.set(report.reportDate, report); return `id-${report.reportDate}` },
  }
}
const analyst = { summarize: async () => ({ text: 'Resumen.', source: 'template', promptVersion: '1.0.0', rejectReason: 'empty' }) }

test('today is computed in Costa Rica time, not in the machine time zone', () => {
  assert.equal(todayInCostaRica(new Date('2026-11-23T05:59:00Z')), '2026-11-22')
  assert.equal(todayInCostaRica(new Date('2026-11-23T06:00:00Z')), '2026-11-23')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
})

test('generate stores metrics, 30-day trend and narrative metadata for the date the database returned', async () => {
  const repository = fakeRepository()
  const result = await createDailyReportService({ repository, analyst }).generate(auth, null)
  const saved = repository.saved.get('2026-11-22')
  assert.equal(result.reportDate, '2026-11-22')
  assert.equal(saved.narrative, 'Resumen.')
  assert.deepEqual(saved.metrics.trend_30d, [{ day: '2026-11-22', absences: 1, chat_queries: 0 }])
  assert.deepEqual(saved.metrics.meta, { basis: { absences: 'historica' }, narrative_source: 'template', prompt_version: '1.0.0', narrative_reject_reason: 'empty' })
})

test('regenerating the same date replaces it (one report per date)', async () => {
  const repository = fakeRepository()
  const service = createDailyReportService({ repository, analyst })
  await service.generate(auth, '2026-11-20')
  await service.generate(auth, '2026-11-20')
  assert.equal(repository.saved.size, 1)
})

test('backfill generates the last N days in order and keeps going when one day fails', async () => {
  const repository = fakeRepository({ failOn: '2026-11-21' })
  const results = await createDailyReportService({ repository, analyst, today: () => '2026-11-22' }).backfill(auth, { days: 3 })
  assert.deepEqual(results.map((r) => [r.date, r.ok]), [['2026-11-20', true], ['2026-11-21', false], ['2026-11-22', true]])
  assert.deepEqual([...repository.saved.keys()], ['2026-11-20', '2026-11-22'])
})
