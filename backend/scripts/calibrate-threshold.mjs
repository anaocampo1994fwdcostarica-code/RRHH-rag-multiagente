// npm run calibrate:threshold — mide el mejor puntaje de match_policy_chunks por pregunta (umbral 0,
// como colaborador A, transacciones de solo lectura) y propone el umbral que mejor separa las preguntas
// de política de las que NO deben recuperar nada (23: bono por mascotas, 24: película).
import { mkdirSync, writeFileSync } from 'node:fs'
import { env } from '../src/config/env.js'
import { createVerifiedAuthIdentity } from '../src/security/authIdentity.js'
import { withUserTransaction } from '../src/services/withUserTransaction.js'
import { QUESTION_BANK } from './questionBank.js'
import { connectHarnessAdmin, readHarnessEnv, userIdByEmail } from './lib/harnessAdmin.mjs'
import { closeScriptPool, createScriptEmbeddings } from './lib/ragScriptContext.mjs'

// Documento que debería responder cada pregunta de política (para saber si el mejor fragmento es el correcto).
export const EXPECTED_SOURCE = {
  1: ['POL-RH-01'], 3: ['POL-RH-01'], 4: ['POL-RH-01'], 5: ['POL-RH-02'], 6: ['POL-RH-02'], 7: ['PRO-RH-03'],
  8: ['POL-RH-05'], 10: ['REG-RH-04'], 11: ['REG-RH-04', 'POL-RH-05'], 12: ['MAN-RH-07'], 13: ['MAN-RH-07'],
  14: ['MAN-RH-07'], 15: ['CAT-RH-06'], 16: ['COD-RH-09'], 20: ['CAL-RH-05', 'POL-RH-01'],
}
const NEGATIVE = new Set([23, 24])
const numbers = [...Object.keys(EXPECTED_SOURCE).map(Number), ...NEGATIVE]

const admin = await connectHarnessAdmin()
await admin.query('begin read only')
const employeeId = await userIdByEmail(admin, readHarnessEnv().RLS_TEST_EMPLOYEE_A_EMAIL)
await admin.query('rollback')
await admin.end()
const auth = createVerifiedAuthIdentity({ userId: employeeId, role: 'authenticated' })
const embeddings = await createScriptEmbeddings()

const rows = []
try {
  for (const number of numbers) {
    const { question } = QUESTION_BANK.find((item) => item.number === number)
    const vector = await embeddings.embed(question)
    const hits = await withUserTransaction(auth, async (client) => (await client.query(
      'select document_code, section, similarity from public.match_policy_chunks($1::extensions.vector, 3, 0)', [`[${vector.join(',')}]`])).rows, { completion: 'rollback' })
    const [top] = hits
    const expected = EXPECTED_SOURCE[number]
    rows.push({
      n: number, tipo: NEGATIVE.has(number) ? 'negativa' : 'política', pregunta: question,
      puntaje: Number(top?.similarity ?? 0), documento: top?.document_code ?? '-', seccion: top?.section ?? '-',
      correcto: expected ? (hits.some((hit) => expected.includes(hit.document_code)) ? (expected.includes(top?.document_code) ? 'sí' : 'top-3') : 'NO') : '',
    })
  }
} finally {
  await closeScriptPool()
}

const positives = rows.filter((row) => row.tipo === 'política')
const negatives = rows.filter((row) => row.tipo === 'negativa')
const minPositive = Math.min(...positives.map((row) => row.puntaje))
const maxNegative = Math.max(...negatives.map((row) => row.puntaje))
// Criterio: punto medio del margen entre el peor positivo y el mejor negativo, redondeado a 3 decimales.
// Si no hay margen (se solapan), se prioriza dejar fuera la 23 y se informa qué positivas se pierden.
const proposed = Number((minPositive > maxNegative ? (minPositive + maxNegative) / 2 : maxNegative + 0.001).toFixed(3))
const lost = positives.filter((row) => row.puntaje < proposed).map((row) => row.n)

const fmt = (value) => value.toFixed(3)
const table = ['| # | Tipo | Pregunta | Mejor puntaje | Documento | Sección | Doc. esperado en top-3 |', '|---|---|---|---|---|---|---|',
  ...rows.sort((a, b) => b.puntaje - a.puntaje).map((row) => `| ${row.n} | ${row.tipo} | ${row.pregunta} | ${fmt(row.puntaje)} | ${row.documento} | ${row.seccion} | ${row.correcto} |`)].join('\n')
const summary = [
  `Modelo: ${embeddings.model} · umbral actual: ${env.ragSimilarityThreshold}`,
  `Peor positivo: ${fmt(minPositive)} · mejor negativo: ${fmt(maxNegative)} · margen: ${fmt(minPositive - maxNegative)}`,
  `Umbral propuesto: ${proposed}${lost.length ? ` (se pierden las preguntas ${lost.join(', ')})` : ' (separa todas las preguntas)'}`,
].join('\n')

console.log(table)
console.log(`\n${summary}`)
const dir = new URL('../../docs/evidencias/', import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL('calibracion_umbral_2026-11-21.md', dir), `# Calibración del umbral de similitud\n\n${summary.split('\n').map((line) => `- ${line}`).join('\n')}\n\n${table}\n`)
