import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import app from '../src/app.js'

async function withLocalServer(callback) {
  const server = http.createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const { port } = server.address()
    await callback(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('registers the policies catalog at /api/policies without contacting Supabase', async () => {
  await withLocalServer(async (baseUrl) => {
    for (const suffix of ['/api/policies', '/api/policies?q=vacaciones']) {
      const response = await fetch(`${baseUrl}${suffix}`)
      const payload = await response.json()
      assert.equal(response.status, 401)
      assert.notEqual(response.status, 404)
      assert.equal(payload.error, 'Unauthorized')
    }

    const incorrectPrefix = await fetch(`${baseUrl}/api/api/policies`)
    assert.equal(incorrectPrefix.status, 404)
  })
})
