import { loadPrompt } from '../agents/prompts/index.js'

const NO_EVIDENCE_MARKER = 'SIN_EVIDENCIA'
const ESCALATION_TEXT = '¿Quieres que la escale a RRHH?'
const NOT_FOUND_ANSWER = `No encontré una política que responda esta consulta en los documentos publicados. ${ESCALATION_TEXT}`

function citationFromChunk(chunk) {
  return {
    documentId: chunk.document_id,
    documentTitle: chunk.document_title,
    documentCode: chunk.document_code ?? null,
    section: chunk.section ?? null,
    version: chunk.version ?? null,
    url: chunk.document_url ?? null,
  }
}

function formatChunk(chunk, index) {
  const header = [chunk.document_code, chunk.document_title, chunk.section && `Sección: ${chunk.section}`, chunk.version && `Versión: ${chunk.version}`].filter(Boolean).join(' | ')
  return `[${index + 1}] (${header})\n${chunk.content}`
}

// Índices [n] citados por el modelo que correspondan a fragmentos recuperados.
export function citedIndexes(answer, total) {
  const indexes = new Set()
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1])
    if (n >= 1 && n <= total) indexes.add(n - 1)
  }
  return [...indexes]
}

export function createPolicyAgent({ embeddings, vectors, llm, prompt = loadPrompt('policyAgent') }) {
  if (!embeddings?.embed || !vectors?.search || !llm?.generate) throw new TypeError('Policy agent requires embedding, vector, and generation providers.')

  const notFound = () => ({ evidenceStatus: 'insufficient', escalationOffered: true, answer: NOT_FOUND_ANSWER, citations: [], promptVersion: prompt.version })

  return {
    async answer(auth, question) {
      const embedding = await embeddings.embed(question)
      const chunks = await vectors.search(auth, embedding)
      // Similitud por debajo del umbral del RPC: no se inventa la política y se ofrece escalar.
      if (!Array.isArray(chunks) || chunks.length === 0) return notFound()

      const context = chunks.map(formatChunk).join('\n\n')
      const raw = await llm.generate(`${prompt.text}\n\nPregunta: ${question}\n\nEvidencia:\n${context}`)
      if (!raw) return { evidenceStatus: 'unavailable', answer: 'No fue posible generar una respuesta basada en la evidencia recuperada.', citations: [], promptVersion: prompt.version }

      const answer = raw.trim()
      if (answer.includes(NO_EVIDENCE_MARKER)) return notFound()

      // Las citas salen solo de filas del RPC, nunca del texto del modelo. Si el modelo no citó, se usa el mejor fragmento.
      const indexes = citedIndexes(answer, chunks.length)
      const cited = (indexes.length ? indexes : [0]).map((i) => chunks[i])
      const seen = new Set()
      const citations = cited.map(citationFromChunk).filter((c) => {
        const key = `${c.documentId}|${c.section}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return { evidenceStatus: 'supported', escalationOffered: false, answer, citations, promptVersion: prompt.version }
    },
  }
}
