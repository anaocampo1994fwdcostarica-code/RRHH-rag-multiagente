const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Cuerpo de POST /chat: incluye conversationId solo si es un UUID válido. */
export function buildChatRequestBody(question, conversationId) {
  const body = { question: question.trim() }
  if (typeof conversationId === 'string' && uuidPattern.test(conversationId)) body.conversationId = conversationId
  return body
}

/** Conserva la conversación: adopta el id que devuelve el backend o mantiene el actual. */
export function nextConversationId(currentId, responseData) {
  const received = responseData?.conversationId
  return typeof received === 'string' && uuidPattern.test(received) ? received : currentId ?? null
}

/** El aviso de escalamiento se muestra solo cuando el backend lo ofrece explícitamente. */
export function shouldOfferEscalation(message) {
  return message?.escalationOffered === true
}

export const ESCALATION_PROMPT = '¿Quieres que RRHH te contacte?'
