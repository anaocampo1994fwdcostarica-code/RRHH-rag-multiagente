import assert from 'node:assert/strict'
import test from 'node:test'
import { errorHandler } from '../src/middlewares/errorHandler.js'

function responseRecorder() {
  return {
    statusCode: undefined,
    body: undefined,
    status(statusCode) { this.statusCode = statusCode; return this },
    json(body) { this.body = body; return this },
  }
}

test('does not expose unexpected server error details in development', () => {
  const response = responseRecorder()
  errorHandler(new Error('Missing required environment variable: SUPABASE_PUBLISHABLE_KEY'), {}, response, () => {})
  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.body, { error: 'Internal server error' })
})
