import { useCallback, useEffect, useState } from 'react'
import { checkPermission } from './employeesApi.js'

/**
 * Returns { allowed, loading, error, retry }.
 * `allowed: false` means the user lacks the permission; `error: true` means the check itself failed
 * (network / 5xx), so callers must not treat it as a denial.
 */
export function usePermissionState(permission) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: null, allowed: false, error: false })
  const key = `${permission}|${attempt}`

  useEffect(() => {
    let active = true
    checkPermission(permission)
      .then((r) => active && setState({ key, allowed: r.data?.allowed === true, error: false }))
      .catch((e) => active && setState({ key, allowed: false, error: ![401, 403, 404].includes(e?.status) }))
    return () => { active = false }
  }, [permission, key])

  const loading = state.key !== key
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { allowed: !loading && state.allowed, loading, error: !loading && state.error, retry }
}

export function usePermission(permission) { return usePermissionState(permission).allowed }
