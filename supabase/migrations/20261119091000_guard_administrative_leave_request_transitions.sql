-- Proposal only: apply manually after review in the Supabase test SQL Editor.
begin;

create or replace function public.guard_employee_leave_request_submission()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if public.has_permission('requests.manage') then
    if old.deleted_at is not null
      or old.resolved_at is not null
      or new.resolved_at is not null
      or not (
        (old.status = 'submitted' and new.status = 'in_review')
        or (old.status = 'in_review' and new.status in ('approved', 'rejected'))
      )
      or (
        to_jsonb(new) - array['status', 'resolved_at', 'updated_at']
        is distinct from
        to_jsonb(old) - array['status', 'resolved_at', 'updated_at']
      )
    then
      raise exception using errcode = '42501', message = 'Administrative leave request transition is not permitted.';
    end if;

    if new.status in ('approved', 'rejected') then
      new.resolved_at := now();
    else
      new.resolved_at := old.resolved_at;
    end if;
    return new;
  end if;

  if old.employee_id is distinct from public.current_employee_id()
    or old.deleted_at is not null
    or old.resolved_at is not null
    or old.status <> 'draft'
    or new.status <> 'submitted'
    or (
      to_jsonb(new) - array['status', 'submitted_at', 'updated_at']
      is distinct from
      to_jsonb(old) - array['status', 'submitted_at', 'updated_at']
    )
  then
    raise exception using errcode = '42501', message = 'Leave request submission is not permitted.';
  end if;

  new.submitted_at := now();
  return new;
end;
$$;

revoke all on function public.guard_employee_leave_request_submission()
from public, anon, authenticated, service_role;

commit;
