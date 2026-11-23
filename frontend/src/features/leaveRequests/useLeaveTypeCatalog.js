import { useCallback, useEffect, useMemo, useState } from 'react'
import { listLeaveTypes } from './leaveRequestsApi.js'
import { createLeaveTypeNameResolver } from './presentation.js'

export function useLeaveTypeCatalog() {
  const [leaveTypes, setLeaveTypes] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    let cancelled = false
    listLeaveTypes({ limit: 50 })
      .then((response) => {
        if (!cancelled) {
          setLeaveTypes(response.data)
          setState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaveTypes([])
          setState('error')
        }
      })
    return () => { cancelled = true }
  }, [])

  const resolveLeaveType = useMemo(() => createLeaveTypeNameResolver(leaveTypes), [leaveTypes])
  const getLeaveTypeLabel = useCallback((leaveTypeId) => {
    if (state === 'loading') return 'Cargando tipo de permiso…'
    return resolveLeaveType(leaveTypeId)
  }, [resolveLeaveType, state])

  return { getLeaveTypeLabel, state }
}
