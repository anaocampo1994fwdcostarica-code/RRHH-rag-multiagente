function citationFromChunk(chunk) {
  return {
    documentId: chunk.document_id,
    documentTitle: chunk.document_title,
    section: chunk.section ?? null,
    version: chunk.version ?? null,
    url: chunk.document_url ?? null,
  }
}

export function createPolicyAgent({ embeddings, vectors, llm }) {
  if (!embeddings?.embed || !vectors?.search || !llm?.generate) throw new TypeError('Policy agent requires embedding, vector, and generation providers.')

  return {
    async answer(auth, question) {
      const embedding = await embeddings.embed(question)
      const chunks = await vectors.search(auth, embedding)
      if (!Array.isArray(chunks) || chunks.length === 0) {
        // Similitud por debajo del umbral del RPC: no se inventa la política y se ofrece escalar.
        return { evidenceStatus: 'insufficient', escalationOffered: true, answer: 'No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH?', citations: [] }
      }

      const context = chunks.map((chunk, index) => `[${index + 1}] ${chunk.content}`).join('\n\n')
      const answer = await llm.generate(`Responde únicamente con la evidencia proporcionada. Si no basta, dilo.\n\nPregunta: ${question}\n\nEvidencia:\n${context}`)
      if (!answer) return { evidenceStatus: 'unavailable', answer: 'No fue posible generar una respuesta basada en la evidencia recuperada.', citations: [] }

      // Citations originate only from retrieved RPC rows, never from model output.
      return { evidenceStatus: 'supported', answer, citations: chunks.map(citationFromChunk) }
    },
  }
}
