import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from './dataApiError.js'

export function createPermissionsRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async hasPermission(auth, permission) {
      const client = createDataClient(auth)
      const { data, error } = await client.rpc('has_permission', { required_permission: permission })
      throwDataApiError(error)
      return data === true
    },
  }
}

export const permissionsRepository = createPermissionsRepository()
