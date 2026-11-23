import assert from 'node:assert/strict'
import test from 'node:test'
import { getEvidenceLabel, isSafeMarkdownHref, remarkCitationMarkers } from '../src/features/chat/chatPresentation.js'
import { isSafeCitationUrl } from '../src/features/chat/citationUrl.js'

test('maps evidence status to Spanish labels', () => {
  assert.equal(getEvidenceLabel('supported', 'policy'), 'Respaldada por políticas')
  assert.equal(getEvidenceLabel('supported', 'data'), 'Datos de tu registro')
  assert.equal(getEvidenceLabel('partial'), 'Respaldo parcial')
  assert.equal(getEvidenceLabel('insufficient'), 'Sin evidencia en las políticas')
  assert.equal(getEvidenceLabel('restricted'), 'Acceso restringido')
  assert.equal(getEvidenceLabel('out_of_scope'), 'Fuera de alcance')
  assert.equal(getEvidenceLabel('weird'), 'Servicio no disponible')
})

test('markdown links allow http, https and mailto but reject javascript', () => {
  assert.equal(isSafeMarkdownHref('https://example.com'), true)
  assert.equal(isSafeMarkdownHref('http://example.com'), true)
  assert.equal(isSafeMarkdownHref('mailto:security@example.com'), true)
  assert.equal(isSafeMarkdownHref('javascript:alert(1)'), false)
})

test('citation urls allow drive and docs only', () => {
  assert.equal(isSafeCitationUrl('https://docs.google.com/document/d/1'), true)
  assert.equal(isSafeCitationUrl('https://evil.com'), false)
})

test('citation markers become anchors within range', () => {
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Hola [1] y [5] fin' }] }] }
  remarkCitationMarkers({ messageId: 2, count: 2 })(tree)
  const kids = tree.children[0].children
  assert.equal(kids[1].type, 'link')
  assert.equal(kids[1].url, '#cita-2-1')
  assert.equal(kids[2].value, ' y [5] fin')
})
