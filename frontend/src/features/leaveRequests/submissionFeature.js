export function isLeaveRequestSubmissionEnabled(environment = import.meta.env) {
  return environment?.VITE_ENABLE_LEAVE_REQUEST_SUBMISSION === 'true'
}

export function canSubmitLeaveRequest(request, environment = import.meta.env) {
  return isLeaveRequestSubmissionEnabled(environment) && request?.status === 'draft'
}
