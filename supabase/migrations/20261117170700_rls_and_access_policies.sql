-- These helpers run with owner privileges to avoid recursive RLS checks.
create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.profile_id = auth.uid() and p.code = required_permission
  );
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees
  where profile_id = auth.uid() and deleted_at is null
  limit 1;
$$;

create or replace function public.owns_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assistant_conversations
    where id = target_conversation_id and owner_profile_id = auth.uid() and deleted_at is null
  );
$$;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  r.code = 'admin'
  or (r.code = 'hr' and p.code in ('employees.read', 'employees.manage', 'requests.manage', 'policies.manage', 'documents.manage', 'reports.read', 'reports.manage'))
  or (r.code = 'auditor' and p.code in ('audit.read', 'reports.read'))
)
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_request_status_history enable row level security;
alter table public.hr_policies enable row level security;
alter table public.policy_versions enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_sync_runs enable row level security;
alter table public.document_chunks enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_message_sources enable row level security;
alter table public.daily_hr_reports enable row level security;
alter table public.admin_audit_log enable row level security;

create policy profiles_read_own_or_staff on public.profiles for select to authenticated using (id = auth.uid() or public.has_permission('employees.read'));
create policy roles_admin_read on public.roles for select to authenticated using (public.has_permission('access.manage'));
create policy permissions_admin_read on public.permissions for select to authenticated using (public.has_permission('access.manage'));
create policy user_roles_admin_manage on public.user_roles for all to authenticated using (public.has_permission('access.manage')) with check (public.has_permission('access.manage'));
create policy role_permissions_admin_manage on public.role_permissions for all to authenticated using (public.has_permission('access.manage')) with check (public.has_permission('access.manage'));

create policy departments_read_authenticated on public.departments for select to authenticated using (is_active and archived_at is null);
create policy departments_manage_staff on public.departments for all to authenticated using (public.has_permission('employees.manage')) with check (public.has_permission('employees.manage'));
create policy positions_read_authenticated on public.positions for select to authenticated using (is_active and archived_at is null);
create policy positions_manage_staff on public.positions for all to authenticated using (public.has_permission('employees.manage')) with check (public.has_permission('employees.manage'));
create policy employees_read_own_or_staff on public.employees for select to authenticated using (profile_id = auth.uid() or public.has_permission('employees.read'));
create policy employees_manage_staff on public.employees for all to authenticated using (public.has_permission('employees.manage')) with check (public.has_permission('employees.manage'));

create policy leave_types_read_authenticated on public.leave_types for select to authenticated using (is_active);
create policy leave_types_manage_staff on public.leave_types for all to authenticated using (public.has_permission('requests.manage')) with check (public.has_permission('requests.manage'));
create policy requests_read_own_or_staff on public.leave_requests for select to authenticated using (employee_id = public.current_employee_id() or public.has_permission('requests.manage'));
create policy requests_insert_own_draft on public.leave_requests for insert to authenticated with check (employee_id = public.current_employee_id() and status = 'draft');
create policy requests_manage_staff on public.leave_requests for all to authenticated using (public.has_permission('requests.manage')) with check (public.has_permission('requests.manage'));
create policy request_history_read_own_or_staff on public.leave_request_status_history for select to authenticated using (public.has_permission('requests.manage') or exists (select 1 from public.leave_requests lr where lr.id = request_id and lr.employee_id = public.current_employee_id()));

create policy policies_read_published on public.hr_policies for select to authenticated using ((status = 'published' and archived_at is null) or public.has_permission('policies.manage'));
create policy policies_manage_staff on public.hr_policies for all to authenticated using (public.has_permission('policies.manage')) with check (public.has_permission('policies.manage'));
create policy policy_versions_manage_staff on public.policy_versions for all to authenticated using (public.has_permission('policies.manage')) with check (public.has_permission('policies.manage'));

create policy documents_manage_staff on public.documents for all to authenticated using (public.has_permission('documents.manage')) with check (public.has_permission('documents.manage'));
create policy document_versions_manage_staff on public.document_versions for all to authenticated using (public.has_permission('documents.manage')) with check (public.has_permission('documents.manage'));
create policy document_sync_runs_manage_staff on public.document_sync_runs for all to authenticated using (public.has_permission('documents.manage')) with check (public.has_permission('documents.manage'));
create policy document_chunks_manage_staff on public.document_chunks for all to authenticated using (public.has_permission('documents.manage')) with check (public.has_permission('documents.manage'));

create policy conversations_read_own on public.assistant_conversations for select to authenticated using (owner_profile_id = auth.uid());
create policy conversations_insert_own on public.assistant_conversations for insert to authenticated with check (owner_profile_id = auth.uid());
create policy conversations_update_own on public.assistant_conversations for update to authenticated using (owner_profile_id = auth.uid()) with check (owner_profile_id = auth.uid());
create policy messages_read_own on public.assistant_messages for select to authenticated using (public.owns_conversation(conversation_id));
create policy messages_insert_own on public.assistant_messages for insert to authenticated with check (public.owns_conversation(conversation_id) and role = 'user');
create policy message_sources_read_own on public.assistant_message_sources for select to authenticated using (exists (select 1 from public.assistant_messages am where am.id = assistant_message_id and public.owns_conversation(am.conversation_id)));

create policy reports_read_staff on public.daily_hr_reports for select to authenticated using (public.has_permission('reports.read'));
create policy reports_manage_staff on public.daily_hr_reports for all to authenticated using (public.has_permission('reports.manage')) with check (public.has_permission('reports.manage'));
create policy audit_read_auditors on public.admin_audit_log for select to authenticated using (public.has_permission('audit.read'));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
