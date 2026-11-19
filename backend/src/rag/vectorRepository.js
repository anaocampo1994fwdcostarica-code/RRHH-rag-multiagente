import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from '../repositories/dataApiError.js'

export function createVectorRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async search(auth, embedding, { limit = 5, threshold = 0.7 } = {}) {
      if (!Array.isArray(embedding) || embedding.length !== 768 || embedding.some((value) => !Number.isFinite(value))) throw new Error('Invalid query embedding.')
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Invalid retrieval limit.')
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Invalid similarity threshold.')

      const { data, error } = await createDataClient(auth).rpc('match_policy_chunks', {
        query_embedding: embedding,
        match_limit: limit,
        similarity_threshold: threshold,
      })
      throwDataApiError(error)
      return Array.isArray(data) ? data : []
    },
  }
}
