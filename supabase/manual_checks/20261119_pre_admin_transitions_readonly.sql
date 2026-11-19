-- Run only in the authorized Supabase test project's SQL Editor.
-- This file contains read-only catalog inspection queries.

-- RLS policies that govern employee and staff access to leave requests.
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'leave_requests'
order by policyname;

-- Installed user triggers and their effective definitions.
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.leave_requests'::regclass
  and not tgisinternal
order by tgname;

-- Current security guard and history trigger functions.
select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'guard_employee_leave_request_submission',
    'record_leave_request_status',
    'set_updated_at',
    'current_employee_id',
    'has_permission'
  )
order by p.proname;

-- Leave request columns, types, nullability, and defaults.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leave_requests'
order by ordinal_position;

-- CHECK, foreign-key, primary-key, and unique constraints affecting transitions.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.leave_requests'::regclass
order by conname;

-- History schema and its trigger attachment.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leave_request_status_history'
order by ordinal_position;

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.leave_requests'::regclass
  and tgname = 'leave_requests_status_history';

-- EXECUTE privileges for functions used by RLS and triggers.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'guard_employee_leave_request_submission',
    'record_leave_request_status',
    'set_updated_at',
    'current_employee_id',
    'has_permission'
  )
order by p.proname, arguments;
