import { createHttpError } from '../errors/httpError.js'
import { orchestrateQuestion } from '../agents/orchestrator.js'

export function createChatController({ answer = orchestrateQuestion } = {}) {
  return async function askChat(request, response, next) {
    try {
      const question = request.body?.question
      if (typeof question !== 'string' || !question.trim() || question.length > 1000) throw createHttpError(400, 'Invalid question')
      response.status(200).json({ data: await answer(request.auth, question.trim()) })
    } catch (error) {
      next(error)
    }
  }
}

export const askChat = createChatController()
