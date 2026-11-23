import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import app from '../src/app.js'
import { isSecurityLabEnabled } from '../src/controllers/securityLabController.js'

test('security lab is disabled unless explicitly enabled', () => {
  assert.equal(isSecurityLabEnabled({ nodeEnv: 'test' }), false)
  process.env.SECURITY_LAB = '0'
  assert.equal(isSecurityLabEnabled({ nodeEnv: 'test' }), false)
  process.env.SECURITY_LAB = '1'
  assert.equal(isSecurityLabEnabled({ nodeEnv: 'test' }), true)
  assert.equal(isSecurityLabEnabled({ nodeEnv: 'production' }), false)
  delete process.env.SECURITY_LAB
})

test('disabled lab returns 404 and safe endpoint rejects injection payloads', async () => {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    process.env.SECURITY_LAB = '0'
    const disabled = await fetch(`http://127.0.0.1:${port}/api/lab/safe/search?email=test%40example.test`)
    assert.equal(disabled.status, 404)
    process.env.SECURITY_LAB = '1'
    const injection = await fetch(`http://127.0.0.1:${port}/api/lab/safe/search?email=${encodeURIComponent("' OR '1'='1")}`)
    assert.ok([400, 200].includes(injection.status))
    if (injection.status === 200) assert.deepEqual((await injection.json()).data, [])
  } finally {
    delete process.env.SECURITY_LAB
    await new Promise((resolve) => server.close(resolve))
  }
})
