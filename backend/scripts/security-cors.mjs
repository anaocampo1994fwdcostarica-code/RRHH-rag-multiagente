import { spawn } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = process.env.SECURITY_TEST_PORT ?? '3102'
const base = process.env.SECURITY_TEST_BASE_URL ?? `http://127.0.0.1:${port}/api`
const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, CORS_ORIGINS: 'http://localhost:5173', PORT: port }, stdio: 'ignore' })
async function run(path, options) { const response = await fetch(`${base}${path}`, options); return { status: response.status, allowOrigin: response.headers.get('access-control-allow-origin'), allowMethods: response.headers.get('access-control-allow-methods') } }
try {
  let ready = false
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${base}/health`)).ok) { ready = true; break } } catch { /* backend is still starting */ } await delay(100) }
  if (!ready) throw new Error('Backend did not become ready')
  const results = {
    allowedOrigin: await run('/health', { headers: { Origin: 'http://localhost:5173' } }),
    rejectedOrigin: await run('/health', { headers: { Origin: 'http://evil.localhost:6666' } }),
    disallowedPreflight: await run('/health', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'TRACE', 'Access-Control-Request-Headers': 'Authorization' } }),
  }
  console.log(JSON.stringify(results, null, 2))
} finally { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill() }
