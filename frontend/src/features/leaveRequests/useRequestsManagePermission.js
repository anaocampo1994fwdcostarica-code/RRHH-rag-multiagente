import { useEffect, useState } from 'react'
import { getRequestsManagePermission } from './adminLeaveRequestsApi.js'

export function useRequestsManagePermission() {
  const [state, setState] = useState('loading')
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getRequestsManagePermission()
      .then((response) => {
        if (!cancelled) {
          setAllowed(response?.data?.allowed === true)
          setState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllowed(false)
          setState('error')
        }
      })
    return () => { cancelled = true }
  }, [])

  return { allowed, state }
}
