import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from './dataApiError.js'

const leaveTypeColumns = 'id,code,name,requires_attachment'

export function createLeaveTypesRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async listActive(auth, { limit, offset }) {
      const client = createDataClient(auth)
      const { data, error, count } = await client
        .from('leave_types')
        .select(leaveTypeColumns, { count: 'exact' })
        .eq('is_active', true)
        .order('name', { ascending: true })
        .range(offset, offset + limit - 1)

      throwDataApiError(error)
      return { rows: data ?? [], total: count ?? 0 }
    },
  }
}

export const leaveTypesRepository = createLeaveTypesRepository()
