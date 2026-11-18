import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from './dataApiError.js'

const policyColumns = 'id,slug,title,category,status,summary,updated_at'

export function createPoliciesRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async list(auth, { category, search, limit, offset }) {
      const client = createDataClient(auth)
      let request = client
        .from('hr_policies')
        .select(policyColumns, { count: 'exact' })
        .eq('status', 'published')
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (category) request = request.eq('category', category)
      if (search) request = request.ilike('title', `%${search}%`)

      const { data, error, count } = await request
      throwDataApiError(error)
      return { rows: data ?? [], total: count ?? 0 }
    },

    async findBySlug(auth, slug) {
      const client = createDataClient(auth)
      const { data, error } = await client
        .from('hr_policies')
        .select(policyColumns)
        .eq('slug', slug)
        .eq('status', 'published')
        .is('archived_at', null)
        .maybeSingle()

      throwDataApiError(error)
      return data ?? null
    },
  }
}

export const policiesRepository = createPoliciesRepository()
