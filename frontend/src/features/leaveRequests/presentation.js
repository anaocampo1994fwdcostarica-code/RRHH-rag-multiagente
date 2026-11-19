export const leaveRequestStatuses = Object.freeze(['', 'draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled'])

const statusLabels = Object.freeze({
  draft: 'Borrador',
  submitted: 'Enviada',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
})

const statusStyles = Object.freeze({
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-sky-100 text-sky-800',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-700',
})

export function getLeaveRequestStatusLabel(status) {
  return statusLabels[status] ?? 'Estado no disponible'
}

export function getLeaveRequestStatusStyle(status) {
  return statusStyles[status] ?? 'bg-slate-100 text-slate-700'
}

export function formatCostaRicaDate(value) {
  if (typeof value !== 'string') return 'Fecha no disponible'
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return 'Fecha no disponible'

  const [, year, month, day] = match
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (calendarDate.getUTCFullYear() !== Number(year) || calendarDate.getUTCMonth() !== Number(month) - 1 || calendarDate.getUTCDate() !== Number(day)) {
    return 'Fecha no disponible'
  }
  return `${day}/${month}/${year}`
}

export function createLeaveTypeNameResolver(leaveTypes = []) {
  const namesById = new Map(
    leaveTypes
      .filter((leaveType) => typeof leaveType?.id === 'string' && typeof leaveType?.name === 'string' && leaveType.name.trim())
      .map((leaveType) => [leaveType.id, leaveType.name.trim()]),
  )

  return (leaveTypeId) => namesById.get(leaveTypeId) ?? 'Tipo de permiso no disponible'
}

export function toLeaveRequestPresentation(request, resolveLeaveType = createLeaveTypeNameResolver()) {
  return {
    ...request,
    leaveTypeName: resolveLeaveType(request.leaveTypeId),
    statusLabel: getLeaveRequestStatusLabel(request.status),
    statusStyle: getLeaveRequestStatusStyle(request.status),
    startDateLabel: formatCostaRicaDate(request.startDate),
    endDateLabel: formatCostaRicaDate(request.endDate),
  }
}
