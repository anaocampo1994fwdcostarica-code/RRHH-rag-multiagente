import { createHttpError } from '../errors/httpError.js'
import { orchestrateQuestion } from '../agents/orchestrator.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createChatController({ answer = orchestrateQuestion } = {}) {
  return async function askChat(request, response, next) {
    try {
      const question = request.body?.question
      if (typeof question !== 'string' || !question.trim() || question.length > 1000) throw createHttpError(400, 'Invalid question')
      // conversationId es opcional; si viene, debe ser un UUID (la RLS valida que sea del usuario).
      const conversationId = request.body?.conversationId
      if (conversationId !== undefined && (typeof conversationId !== 'string' || !uuidPattern.test(conversationId))) throw createHttpError(400, 'Invalid conversation')
      response.status(200).json({ data: await answer(request.auth, question.trim(), { conversationId }) })
    } catch (error) {
      next(error)
    }
  }
}

export const askChat = createChatController()
