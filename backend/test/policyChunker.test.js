import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chunkPolicy, cleanMarkdownInline, formatSheetDate, parseMarkdownPolicy, parsePdfPolicy, parseSheetPolicy, parseSpanishDate, sheetRowToText,
} from '../src/rag/policyChunker.js'

const MARKDOWN = `Café Volcán Demo S.A.

# **Política Salarial y Calendario de Pagos**

| Código | POL-RH-05 |
| :---- | :---- |
| **Versión** | 1.0 |
| **Fecha de vigencia** | 1 de enero de 2026 |
| **Responsable** | Gerencia de Finanzas |

*Documento ficticio.*

# **1\\. Objetivo**

Explicar cómo se paga el salario.

# **3\\. Fechas de pago**

* Primera quincena: el día 15.
* Si cae sábado, domingo o feriado, se paga el día hábil anterior.

| Días | Quién paga |
| :---- | :---- |
| 1 a 3 | La empresa |
| Desde el 4 | La CCSS |

Texto final de la sección.
`

test('Markdown de Google Docs: metadatos de la tabla inicial, título y secciones numeradas', () => {
  const parsed = parseMarkdownPolicy(MARKDOWN)
  assert.equal(parsed.metadata.title, 'Política Salarial y Calendario de Pagos')
  assert.equal(parsed.metadata.code, 'POL-RH-05')
  assert.equal(parsed.metadata.version, '1.0')
  assert.equal(parsed.metadata.effectiveFromDate, '2026-01-01')
  assert.equal(parsed.metadata.owner, 'Gerencia de Finanzas')
  assert.deepEqual(parsed.sections.map((section) => section.section), ['1. Objetivo', '3. Fechas de pago'])
  assert.match(parsed.sections[1].text, /\| 1 a 3 \| La empresa \|/)
})

test('los fragmentos llevan encabezado con documento, código y sección, y no parten tablas', () => {
  const chunks = chunkPolicy(parseMarkdownPolicy(MARKDOWN))
  assert.equal(chunks[0].section, 'Información del documento')
  assert.match(chunks[0].content, /Código: POL-RH-05/)
  const payments = chunks.find((chunk) => chunk.section === '3. Fechas de pago')
  assert.ok(payments.content.startsWith('Política Salarial y Calendario de Pagos (POL-RH-05) — 3. Fechas de pago'))
  assert.match(payments.content, /\| :---- \| :---- \|\n\| 1 a 3 \| La empresa \|\n\| Desde el 4 \| La CCSS \|/)
  chunks.forEach((chunk, index) => assert.equal(chunk.index, index))
})

test('una sección larga se divide por bloques y una tabla grande repite su encabezado', () => {
  const rows = Array.from({ length: 60 }, (_, index) => `| Fila ${index} | ${'x'.repeat(30)} |`).join('\n')
  const parsed = { metadata: { title: 'T', code: 'POL-RH-01' }, intro: '', sections: [{ section: '1. Tabla', text: `| A | B |\n| :- | :- |\n${rows}` }] }
  const chunks = chunkPolicy(parsed, { maxChars: 600 }).filter((chunk) => chunk.section === '1. Tabla')
  assert.ok(chunks.length > 1)
  for (const chunk of chunks) {
    assert.ok(chunk.content.length <= 600, `fragmento de ${chunk.content.length}`)
    assert.match(chunk.content, /\| A \| B \|\n\| :- \| :- \|/)
  }
  const all = chunks.map((chunk) => chunk.content).join('\n')
  for (let index = 0; index < 60; index += 1) assert.ok(all.includes(`| Fila ${index} |`), `falta la fila ${index}`)
})

test('PDF: quita pies de página, reconoce un título que empieza por "Código" y solo secciones en orden', () => {
  const text = [
    'Café Volcán Demo S.A.', 'Código de Conducta y Protocolo de Denuncias', 'Código COD-RH-09', 'Versión 1.0',
    'Fecha de vigencia 1 de enero de 2026', 'Responsable Coordinación de Salud Ocupacional y', 'Recursos Humanos',
    'Aprobado por Gerencia General', 'Documento ficticio.', '1. Objetivo', 'Texto del objetivo.', '2. Cómo denunciar',
    ' Paso uno.', '3. Plazo de 10 días hábiles.', 'Café Volcán Demo S.A. · Código · COD-RH-09 · Versión 1.0 · Vigente desde el 1 de enero de 2026',
    'de 2026', '-- 1 of 2 --', '3. Confidencialidad', 'Se protege la identidad.',
  ].join('\n')
  const parsed = parsePdfPolicy(text)
  assert.equal(parsed.metadata.title, 'Código de Conducta y Protocolo de Denuncias')
  assert.equal(parsed.metadata.code, 'COD-RH-09')
  assert.equal(parsed.metadata.owner, 'Coordinación de Salud Ocupacional y Recursos Humanos')
  assert.deepEqual(parsed.sections.map((section) => section.section), ['1. Objetivo', '2. Cómo denunciar', '3. Confidencialidad'])
  assert.match(parsed.sections[1].text, /3\. Plazo de 10 días hábiles\./, 'una línea numerada con punto final es contenido, no sección')
  assert.doesNotMatch(parsed.sections.map((section) => section.text).join('\n'), /Vigente desde|of 2/)
})

test('Sheets: hoja Información da metadatos y cada fila se convierte en texto legible', () => {
  const parsed = parseSheetPolicy([
    { section: 'Información', rows: [['Título', 'Calendario 2026'], ['Código', 'CAL-RH-05'], ['Versión', '1.0'], ['Fecha de vigencia', '1 de enero de 2026']] },
    { section: 'Feriados 2026', rows: [['Fecha', 'Día', 'Feriado', 'Tipo de pago'], ['25/12/2026', 'viernes', 'Navidad', 'Pago obligatorio'], []] },
  ])
  assert.equal(parsed.metadata.code, 'CAL-RH-05')
  assert.equal(parsed.metadata.title, 'Calendario 2026')
  assert.equal(parsed.sections[1].text, 'Feriado: Navidad. Fecha: viernes 25 de diciembre de 2026. Tipo de pago: Pago obligatorio.')
})

test('utilidades de fechas y limpieza', () => {
  assert.equal(parseSpanishDate('Vigente desde el 15 de marzo de 2026'), '2026-03-15')
  assert.equal(parseSpanishDate('sin fecha'), null)
  assert.equal(formatSheetDate('13/11/2026'), 'viernes 13 de noviembre de 2026')
  assert.equal(formatSheetDate('31/02/2026'), null)
  assert.equal(cleanMarkdownInline('**1\\. Objetivo** \\= 1/12 \\#2'), '1. Objetivo = 1/12 #2')
  assert.equal(sheetRowToText(['Fecha de pago', 'Día', 'Periodo'], ['13/11/2026', 'viernes', 'Primera quincena de noviembre 2026']),
    'Periodo: Primera quincena de noviembre 2026. Fecha de pago: viernes 13 de noviembre de 2026.')
})
