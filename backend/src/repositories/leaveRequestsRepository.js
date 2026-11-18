import { createHttpError } from '../errors/httpError.js'
import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from './dataApiError.js'

const requestColumns = 'id,leave_type_id,start_date,end_date,reason,status,submitted_at,resolved_at,created_at,updated_at'

export function createLeaveRequestsRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async list(auth, { status, startDateFrom, startDateTo, limit, offset }) {
      const client = createDataClient(auth)
      let request = client
        .from('leave_requests')
        .select(requestColumns, { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status) request = request.eq('status', status)
      if (startDateFrom) request = request.gte('start_date', startDateFrom)
      if (startDateTo) request = request.lte('start_date', startDateTo)

      const { data, error, count } = await request
      throwDataApiError(error)
      return { rows: data ?? [], total: count ?? 0 }
    },

    async findVisibleById(auth, id) {
      const client = createDataClient(auth)
      const { data, error } = await client
        .from('leave_requests')
        .select(requestColumns)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()

      throwDataApiError(error)
      return data ?? null
    },

    async resolveCurrentEmployeeId(auth) {
      const client = createDataClient(auth)
      const { data, error } = await client
        .from('employees')
        .select('id')
        .eq('profile_id', auth.userId)
        .is('deleted_at', null)
        .maybeSingle()

      throwDataApiError(error)
      if (!data?.id) throw createHttpError(403, 'Forbidden')
      return data.id
    },

    async findActiveLeaveType(auth, leaveTypeId) {
      const client = createDataClient(auth)
      const { data, error } = await client
        .from('leave_types')
        .select('id,is_active,requires_attachment')
        .eq('id', leaveTypeId)
        .eq('is_active', true)
        .maybeSingle()

      throwDataApiError(error)
      return data ?? null
    },

    async createDraft(auth, { employeeId, leaveTypeId, startDate, endDate, reason }) {
      const client = createDataClient(auth)
      const { data, error } = await client
        .from('leave_requests')
        .insert({
          employee_id: employeeId,
          leave_type_id: leaveTypeId,
          start_date: startDate,
          end_date: endDate,
          reason,
          status: 'draft',
          submitted_at: null,
        })
        .select(requestColumns)
        .single()

      throwDataApiError(error)
      return data
    },
  }
}

export const leaveRequestsRepository = createLeaveRequestsRepository()
