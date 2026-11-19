-- Allows an employee to submit only their own active draft. This migration does
-- not change the broader administrative capabilities already granted by
-- requests.manage.
begin;

create function public.guard_employee_leave_request_submission()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  -- Staff authorization remains governed by the existing requests.manage RLS
  -- policy. Administrative state transitions are intentionally out of scope.
  if public.has_permission('requests.manage') then
    return new;
  end if;

  if old.employee_id is distinct from public.current_employee_id()
    or old.deleted_at is not null
    or old.status <> 'draft'
    or new.status <> 'submitted'
    or (
      to_jsonb(new) - array['status', 'submitted_at', 'updated_at']
      is distinct from
      to_jsonb(old) - array['status', 'submitted_at', 'updated_at']
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Leave request submission is not permitted.';
  end if;

  -- The database, not a client or API server clock, records the submission.
  new.submitted_at := now();
  return new;
end;
$$;

-- Trigger functions are not an API surface.
revoke all on function public.guard_employee_leave_request_submission()
from public, anon, authenticated, service_role;

-- PostgreSQL executes same-kind triggers alphabetically. This guard runs before
-- leave_requests_set_updated_at, which remains responsible for updated_at.
create trigger leave_requests_guard_employee_submission
before update on public.leave_requests
for each row
execute procedure public.guard_employee_leave_request_submission();

-- RLS identifies the old and new rows eligible for the employee transition.
-- The trigger above protects every other present and future column.
create policy requests_update_own_draft_to_submitted
on public.leave_requests
for update
to authenticated
using (
  employee_id = public.current_employee_id()
  and status = 'draft'
  and deleted_at is null
)
with check (
  employee_id = public.current_employee_id()
  and status = 'submitted'
  and deleted_at is null
);

commit;
