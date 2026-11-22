import { usePermissionState } from '../features/employees/usePermission.js'
import AccessDenied from './AccessDenied.jsx'
import { ErrorBlock, LoadingBlock } from './StatusBlocks.jsx'

function PermissionGate({ permission, children }) {
  const { allowed, loading, error, retry } = usePermissionState(permission)
  if (loading) return <LoadingBlock label="Verificando permisos…" />
  if (error) return <ErrorBlock message="No fue posible verificar tus permisos." onRetry={retry} />
  if (!allowed) return <AccessDenied />
  return children
}

export default PermissionGate
