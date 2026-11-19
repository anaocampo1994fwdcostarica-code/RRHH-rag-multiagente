import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from './dataApiError.js'

const adminRequestColumns = 'id,leave_type_id,start_date,end_date,reason,status,submitted_at,resolved_at,created_at,updated_at,employee:employees!leave_requests_employee_id_fkey(employee_code,profile:profiles(display_name)),leave_type:leave_types(name)'

export function createAdminLeaveRequestsRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async list(auth, { status, startDateFrom, startDateTo, limit, offset }) {
      const client = createDataClient(auth)
      let request = client.from('leave_requests').select(adminRequestColumns, { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
      if (status) request = request.eq('status', status)
      if (startDateFrom) request = request.gte('start_date', startDateFrom)
      if (startDateTo) request = request.lte('start_date', startDateTo)
      const { data, error, count } = await request
      throwDataApiError(error)
      return { rows: data ?? [], total: count ?? 0 }
    },
    async findById(auth, id) {
      const client = createDataClient(auth)
      const { data, error } = await client.from('leave_requests').select(adminRequestColumns).eq('id', id).is('deleted_at', null).maybeSingle()
      throwDataApiError(error)
      return data ?? null
    },
  }
}

export const adminLeaveRequestsRepository = createAdminLeaveRequestsRepository()
