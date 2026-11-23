import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from './dataApiError.js'

const columns = 'id,employee_code,employment_status,hired_on,ended_on,profile:profiles(display_name),department:departments(name),position:positions(name)'
export function createEmployeesRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async list(auth, { limit, offset }) {
      const client = createDataClient(auth)
      const { data, error, count } = await client.from('employees').select(columns, { count: 'exact' }).is('deleted_at', null).order('employee_code').range(offset, offset + limit - 1)
      throwDataApiError(error); return { rows: data ?? [], total: count ?? 0 }
    },
    async findById(auth, id) {
      const client = createDataClient(auth)
      const { data, error } = await client.from('employees').select(columns).eq('id', id).is('deleted_at', null).maybeSingle()
      throwDataApiError(error); return data ?? null
    },
  }
}
export const employeesRepository = createEmployeesRepository()
