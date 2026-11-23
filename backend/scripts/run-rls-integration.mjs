import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(scriptDirectory, '../.env.integration'), quiet: true })

const { getDatabaseConfig, getSupabaseAuthConfig } = await import('../src/config/env.js')
const { runRlsIntegration, validateIntegrationConfig } = await import('../src/testing/rlsIntegration.js')

function getRequired(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function loadIntegrationConfig() {
  const database = getDatabaseConfig()
  const supabase = getSupabaseAuthConfig()
  const config = {
    projectRef: getRequired('RLS_INTEGRATION_PROJECT_REF'),
    supabaseUrl: supabase.url,
    databaseUrl: database.url,
    employeeAToken: getRequired('RLS_INTEGRATION_EMPLOYEE_A_ACCESS_TOKEN'),
    employeeBToken: getRequired('RLS_INTEGRATION_EMPLOYEE_B_ACCESS_TOKEN'),
  }
  validateIntegrationConfig(config)
  return config
}

try {
  const config = loadIntegrationConfig()
  if (process.argv.includes('--validate-config')) {
    console.log('RLS integration configuration is valid. No remote connection was opened.')
  } else {
    const report = await runRlsIntegration(config)
    console.table(report.results)
    console.log('RLS integration completed with rollback-only transactions.')
  }
} catch (error) {
  console.error('RLS integration failed:', error.message)
  process.exitCode = 1
}
