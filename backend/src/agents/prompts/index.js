import { readFileSync } from 'node:fs'

// Carga un prompt versionado desde backend/src/agents/prompts/<nombre>.md.
// El encabezado (--- ... ---) aporta metadatos como la versión, que se registran con cada consulta.
export function loadPrompt(name, { readFile = (url) => readFileSync(url, 'utf8') } = {}) {
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) throw new TypeError('Invalid prompt name.')
  const raw = readFile(new URL(`./${name}.md`, import.meta.url))
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  const metadata = {}
  for (const line of (match?.[1] ?? '').split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator > 0) metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  const text = (match?.[2] ?? raw).trim()
  if (!text) throw new Error(`Prompt ${name} is empty.`)
  return Object.freeze({ name, version: metadata.version ?? 'unversioned', text })
}
