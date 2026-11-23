import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyApiError, formatCount, formatDateTimeCostaRica, formatLongDate, formatPercent, formatShortDate, getBasisNotes, getDocumentStatusLabel, getNarrativeSourceLabel, getReportErrorMessage, getSafeExternalUrl, getSyncErrorMessage, isValidDateKey, normalizeTrend, summarizeSyncResult, todayInCostaRica } from '../src/features/reports/reportPresentation.js'
import { getDailyReport, listReportHistory } from '../src/features/reports/reportsApi.js'
import { getLastDocumentSync, requestDocumentSync } from '../src/features/documents/documentsApi.js'

test('formats short and long dates without timezone shifts', () => {
  assert.equal(formatShortDate('2026-11-22'), '22 nov')
  assert.equal(formatLongDate('2026-01-05'), '5 de enero de 2026')
  assert.equal(formatShortDate('2026-02-30'), '—')
  assert.equal(isValidDateKey('2026-11-22'), true)
  assert.equal(isValidDateKey('22/11/2026'), false)
})

test('formats timestamps and today in Costa Rica time (UTC-6)', () => {
  assert.equal(formatDateTimeCostaRica('2026-11-22T03:30:00Z'), '21/11/2026 21:30')
  assert.equal(formatDateTimeCostaRica('nope'), '—')
  assert.equal(todayInCostaRica(new Date('2026-11-22T03:30:00Z')), '2026-11-21')
})

test('formats percentages and counts treating null as an em dash', () => {
  assert.equal(formatPercent(null), '—')
  assert.equal(formatPercent(undefined), '—')
  assert.match(formatPercent(12.5), /^12[.,]5\s%$/)
  assert.equal(formatCount(null), '—')
  assert.equal(formatCount(0), '0')
})

test('labels the narrative source and basis notes', () => {
  assert.equal(getNarrativeSourceLabel('llm'), 'Redactado por IA')
  assert.equal(getNarrativeSourceLabel('template'), 'Plantilla automática')
  assert.equal(getNarrativeSourceLabel('x'), null)
  assert.equal(getBasisNotes({ basis: { vacation: 'foto_actual', other: 'exacta' } }).length, 1)
  assert.equal(getBasisNotes({ basis: 'aproximada' }).length, 1)
  assert.deepEqual(getBasisNotes(undefined), [])
})

test('maps API errors 403/404/409/503 to UI states and messages', () => {
  assert.equal(classifyApiError({ status: 403 }), 'forbidden')
  assert.equal(classifyApiError({ status: 404 }), 'not-found')
  assert.equal(classifyApiError({ status: 409 }), 'conflict')
  assert.equal(classifyApiError({ status: 503 }), 'unavailable')
  assert.equal(classifyApiError(new Error('x')), 'error')
  assert.match(getReportErrorMessage({ status: 404 }), /otra fecha/)
  assert.match(getSyncErrorMessage({ status: 409 }), /en curso/)
  assert.match(getSyncErrorMessage({ status: 503 }), /desactivada/)
})

test('translates document statuses and sanitizes Drive links', () => {
  assert.equal(getDocumentStatusLabel('in_review'), 'En revisión')
  assert.equal(getDocumentStatusLabel('pending'), 'Pendiente de revisión')
  assert.equal(getDocumentStatusLabel('zzz'), 'Estado no disponible')
  assert.equal(getSafeExternalUrl('javascript:alert(1)'), null)
  assert.equal(getSafeExternalUrl('https://drive.google.com/file/d/1'), 'https://drive.google.com/file/d/1')
  assert.equal(getSafeExternalUrl(null), null)
  assert.equal(getSafeExternalUrl('http://drive.google.com/x'), null)
  assert.equal(classifyApiError({ status: 400 }), 'invalid')
  assert.match(getReportErrorMessage({ status: 400 }), /Fecha no válida/)
})

test('summarizes sync results and normalizes the trend', () => {
  assert.equal(summarizeSyncResult({ data: { failed: false, failedDocuments: 0, examined: 3, renamed: 1 } }).tone, 'success')
  assert.match(summarizeSyncResult({ data: { renamed: 2 } }).message, /2 renombrados/)
  assert.equal(summarizeSyncResult({ data: { failed: true, failedDocuments: 2 } }).tone, 'warning')
  assert.match(summarizeSyncResult({ data: { failed: true, failedDocuments: 2 } }).message, /2 documento/)
  assert.deepEqual(normalizeTrend([{ day: '2026-11-22', absences: 2 }]), [{ day: '2026-11-22', label: '22 nov', absences: 2, chat_queries: null }])
  assert.equal(normalizeTrend([{ day: '2026-11-22', absences: 1, chat_queries: 0 }])[0].chat_queries, 0)
  assert.deepEqual(normalizeTrend(null), [])
})

test('report and document APIs build the expected requests', async () => {
  const calls = []
  const client = { request: async (path, options) => { calls.push([path, options]); return {} } }
  await getDailyReport('2026-11-22', client)
  await getDailyReport('bad', client)
  await listReportHistory({ limit: 30 }, client)
  await getLastDocumentSync(client)
  await requestDocumentSync(client)
  assert.deepEqual(calls.map(([path]) => path), ['/reports/daily?date=2026-11-22', '/reports/daily', '/reports/daily/history?limit=30', '/admin/documents/sync/last', '/admin/documents/sync'])
  assert.deepEqual(calls[4][1], { method: 'POST', body: {} })
})
