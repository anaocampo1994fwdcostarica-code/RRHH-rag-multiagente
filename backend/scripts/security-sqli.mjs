import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = process.env.SECURITY_TEST_PORT ?? '3101'
const base = process.env.SECURITY_TEST_BASE_URL ?? `http://127.0.0.1:${port}/api`
const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, SECURITY_LAB: '1', NODE_ENV: 'test', PORT: port }, stdio: ['ignore', 'ignore', 'inherit'] })
async function request(path, options = {}) { const response = await fetch(`${base}${path}`, options); return { status: response.status, body: await response.json().catch(() => null) } }
try {
  let ready = false
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${base}/health`)).ok) { ready = true; break } } catch { /* backend is still starting */ } await delay(100) }
  if (!ready) throw new Error('Backend did not become ready')
  const payloads = { valid: 'ana.solis@example.test', or: "' OR '1'='1", union: "' UNION SELECT id, name, email, fictional_salary, secret_note FROM security_lab.lab_employees --" }
  const rows = []
  for (const [label, email] of Object.entries(payloads)) {
    for (const endpoint of ['vulnerable', 'safe']) rows.push({ target: `${endpoint} lab`, payload: label, request: email, response: await request(`/lab/${endpoint}/search?email=${encodeURIComponent(email)}`) })
  }
  const token = process.env.SECURITY_TEST_ACCESS_TOKEN
  for (const path of ['/chat', '/leave-requests', '/reports/daily?date=2026-01-01']) {
    rows.push({ target: `real ${path}`, payload: 'OR', request: "' OR '1'='1", response: await request(path, { method: path === '/chat' ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(path === '/chat' ? { 'Content-Type': 'application/json' } : {}) }, ...(path === '/chat' ? { body: JSON.stringify({ question: "' OR '1'='1" }) } : {}) }) })
  }
  await mkdir('../docs/seguridad/evidencias', { recursive: true })
  const output = { generatedAt: new Date().toISOString(), base, rows }
  await writeFile('../docs/seguridad/evidencias/sqli-results.json', `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify(output, null, 2))
} finally { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill() }
