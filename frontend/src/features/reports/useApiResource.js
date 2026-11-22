import { useEffect, useState } from 'react'

/**
 * Runs `loader` (must be memoized with useCallback) and exposes { status, data, error }.
 * A new loader identity or a new `key` (e.g. a retry counter) restarts the request and reports 'loading' without synchronous setState.
 */
export function useApiResource(loader, key = 0) {
  const [state, setState] = useState({ loader: null, key: null, status: 'loading', data: null, error: null })

  useEffect(() => {
    let active = true
    loader()
      .then((data) => { if (active) setState({ loader, key, status: 'ready', data, error: null }) })
      .catch((error) => { if (active) setState({ loader, key, status: 'error', data: null, error }) })
    return () => { active = false }
  }, [loader, key])

  return state.loader === loader && state.key === key ? state : { status: 'loading', data: null, error: null }
}
