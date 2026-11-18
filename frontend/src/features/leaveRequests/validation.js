const datePattern = /^\d{4}-\d{2}-\d{2}$/

function isRealIsoDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function validateDraftRequest({ leaveTypeId, startDate, endDate, reason }) {
  const errors = {}
  if (!leaveTypeId) errors.leaveTypeId = 'Selecciona un tipo de permiso.'
  if (!isRealIsoDate(startDate)) errors.startDate = 'Ingresa una fecha inicial válida.'
  if (!isRealIsoDate(endDate)) errors.endDate = 'Ingresa una fecha final válida.'
  if (isRealIsoDate(startDate) && isRealIsoDate(endDate) && endDate < startDate) errors.endDate = 'La fecha final no puede ser anterior a la inicial.'
  if (typeof reason === 'string' && reason.length > 1000) errors.reason = 'El motivo admite un máximo de 1000 caracteres.'
  return errors
}
