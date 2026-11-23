// Copia client_email y private_key de la llave JSON de la cuenta de servicio a backend/.env.
// Nunca imprime la clave privada. Uso: node scripts/configure-drive-env.mjs [ruta.json]
// Sin ruta, toma el único .json de C:\Users\<usuario>\credenciales.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function resolveKeyPath(arg) {
  if (arg) return arg
  const dir = join(homedir(), 'credenciales')
  const jsons = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json'))
  if (jsons.length !== 1) throw new Error(`Se esperaba un solo .json en ${dir}; hay ${jsons.length}. Pasa la ruta como argumento.`)
  return join(dir, jsons[0])
}

function upsert(content, name, value) {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  if (pattern.test(content)) return content.replace(pattern, () => line)
  return `${content.replace(/\s*$/, '')}\n${line}\n`
}

const keyPath = resolveKeyPath(process.argv[2])
const key = JSON.parse(readFileSync(keyPath, 'utf8'))
if (key.type !== 'service_account' || !key.client_email || !key.private_key?.includes('PRIVATE KEY')) {
  throw new Error('El JSON no parece una llave de cuenta de servicio (faltan type, client_email o private_key).')
}

const envPath = new URL('../.env', import.meta.url)
let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
content = upsert(content, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL', key.client_email)
// Una sola línea con \n literales entre comillas; googleDriveClient los convierte de vuelta.
content = upsert(content, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY', `"${key.private_key.replace(/\r?\n/g, '\\n')}"`)
writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 })

console.log(`client_email: ${key.client_email}`)
console.log('private_key: escrita en backend/.env (no se muestra).')
