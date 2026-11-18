-- Security hardening for RLS helper functions and explicit application privileges.
-- Internal jobs use service_role only from trusted server-side code.

revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;

-- Put trusted schemas before pg_temp for every function used by triggers or RLS.
alter function public.set_updated_at() set search_path = pg_catalog, public, pg_temp;
alter function public.handle_new_user() set search_path = pg_catalog, public, pg_temp;
alter function public.record_leave_request_status() set search_path = pg_catalog, public, pg_temp;
alter function public.has_permission(text) set search_path = pg_catalog, public, pg_temp;
alter function public.current_employee_id() set search_path = pg_catalog, public, pg_temp;
alter function public.owns_conversation(uuid) set search_path = pg_catalog, public, pg_temp;

-- Trigger functions must never be callable directly by API roles.
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.record_leave_request_status() from public, anon, authenticated, service_role;

-- RLS helpers are callable only while evaluating policies for authenticated users.
revoke all on function public.has_permission(text) from public, anon, authenticated, service_role;
revoke all on function public.current_employee_id() from public, anon, authenticated, service_role;
revoke all on function public.owns_conversation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.owns_conversation(uuid) to authenticated;

-- Start from no client table or sequence privileges. RLS remains the second gate.
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;

-- service_role is for the Express backend and scheduled internal jobs only.
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Read-only reference and profile access; RLS determines visible rows.
grant select on table public.profiles, public.roles, public.permissions to authenticated;
grant select on table public.departments, public.positions, public.employees to authenticated;
grant select on table public.leave_types, public.leave_request_status_history to authenticated;
grant select on table public.hr_policies, public.policy_versions to authenticated;

-- RLS constrains employee, HR, and administrator operations on these resources.
grant select, insert, update, delete on table public.user_roles, public.role_permissions to authenticated;
grant select, insert, update on table public.departments, public.positions, public.employees to authenticated;
grant select, insert, update on table public.leave_types, public.leave_requests to authenticated;
grant select, insert, update on table public.hr_policies, public.policy_versions to authenticated;
grant select, insert, update on table public.documents, public.document_versions, public.document_sync_runs, public.document_chunks to authenticated;
grant select, insert, update on table public.assistant_conversations to authenticated;
grant select, insert on table public.assistant_messages to authenticated;
grant select on table public.assistant_message_sources to authenticated;
grant select, insert, update on table public.daily_hr_reports to authenticated;
grant select on table public.admin_audit_log to authenticated;

-- Deliberately no authenticated DELETE or direct INSERT rights on audit, history, or source tables.
