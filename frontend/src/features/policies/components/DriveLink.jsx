import { isDriveUrl } from '../policyUtils.js'

function DriveLink({ policy }) {
  if (!isDriveUrl(policy.driveUrl)) return <span className="text-sm text-slate-500">Enlace no disponible</span>
  return <a href={policy.driveUrl} target="_blank" rel="noopener noreferrer" aria-label={`Ver en Drive: ${policy.title} (se abre en una pestaña nueva)`} className="inline-flex shrink-0 rounded-lg bg-[#0f4c5c] px-3 py-2 text-sm font-medium text-white outline-none hover:bg-[#0b3a47] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Ver en Drive</a>
}

export default DriveLink
