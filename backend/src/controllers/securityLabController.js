import { getPostgresPool } from '../services/postgresPool.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isSecurityLabEnabled(env) {
  return env.nodeEnv !== 'production' && process.env.SECURITY_LAB === '1'
}

export function isLocalLabRequest(request) {
  const address = request.ip?.replace('::ffff:', '')
  return address === '127.0.0.1' || address === '::1' || address === 'localhost'
}

function unavailable(request, response) {
  if (!isSecurityLabEnabled(process.env) || !isLocalLabRequest(request)) {
    response.status(404).json({ error: 'Not found' })
    return true
  }
  return false
}

export async function vulnerableSearch(request, response, next) {
  if (unavailable(request, response)) return
  try {
    const email = String(request.query.email ?? '')
    // VULNERABLE A PROPÓSITO – SOLO LABORATORIO.
    const result = await (await getPostgresPool()).query(`select id, name, email, fictional_salary, secret_note from security_lab.lab_employees where email = '${email}'`)
    response.json({ data: result.rows })
  } catch (error) { console.error('security lab vulnerable query failed', error); next(error) }
}

export async function safeSearch(request, response, next) {
  if (unavailable(request, response)) return
  const email = String(request.query.email ?? '')
  if (!emailPattern.test(email) || email.length > 254) return response.status(400).json({ error: 'Invalid email' })
  try {
    const result = await (await getPostgresPool()).query('select id, name, email, fictional_salary from security_lab.lab_employees where email = $1', [email])
    response.json({ data: result.rows })
  } catch (error) { console.error('security lab safe query failed', error); next(error) }
}
