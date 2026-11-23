import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChatRequestBody, ESCALATION_PROMPT, nextConversationId, shouldOfferEscalation } from '../src/features/chat/chatState.js'

const conversationId = '22222222-2222-4222-8222-222222222222'

test('el cuerpo del chat incluye conversationId solo si es un UUID válido', () => {
  assert.deepEqual(buildChatRequestBody('  hola  ', null), { question: 'hola' })
  assert.deepEqual(buildChatRequestBody('hola', conversationId), { question: 'hola', conversationId })
  assert.deepEqual(buildChatRequestBody('hola', 'no-es-uuid'), { question: 'hola' })
})

test('la conversación se conserva entre mensajes', () => {
  assert.equal(nextConversationId(null, { conversationId }), conversationId)
  assert.equal(nextConversationId(conversationId, {}), conversationId)
  assert.equal(nextConversationId(conversationId, { conversationId: null }), conversationId)
  assert.equal(nextConversationId(null, { conversationId: 'x' }), null)
})

test('el aviso de escalamiento aparece solo cuando el backend lo ofrece', () => {
  assert.equal(shouldOfferEscalation({ escalationOffered: true }), true)
  assert.equal(shouldOfferEscalation({ escalationOffered: false }), false)
  assert.equal(shouldOfferEscalation({}), false)
  assert.equal(ESCALATION_PROMPT, '¿Quieres que RRHH te contacte?')
})
