import { useEffect, useState } from 'react'
import { checkPermission } from './employeesApi.js'
export function usePermission(permission) { const [allowed, setAllowed] = useState(false); useEffect(() => { let active = true; checkPermission(permission).then((r) => active && setAllowed(r.data?.allowed === true)).catch(() => active && setAllowed(false)); return () => { active = false } }, [permission]); return allowed }
