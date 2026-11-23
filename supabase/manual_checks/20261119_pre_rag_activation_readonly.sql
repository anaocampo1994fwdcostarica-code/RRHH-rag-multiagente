-- Run manually and only in the authorized Supabase test project.
-- This file contains SELECT-only catalog and data checks; it performs no DDL/DML.

-- 1. pgvector must either be absent (before migration) or be installed in extensions.
select extension.extname, namespace.nspname as schema_name, extension.extversion
from pg_extension extension
join pg_namespace namespace on namespace.oid = extension.extnamespace
where extension.extname = 'vector';

-- 2. Required existing relations and any already-created RAG relation.
select tables.table_name, relation.relrowsecurity as rls_enabled, relation.relforcerowsecurity as rls_forced
from information_schema.tables tables
join pg_class relation on relation.relname = tables.table_name
join pg_namespace namespace on namespace.oid = relation.relnamespace and namespace.nspname = tables.table_schema
where tables.table_schema = 'public'
  and tables.table_name in ('documents', 'document_versions', 'document_chunks', 'document_chunk_embeddings', 'document_sync_runs', 'hr_policies', 'policy_versions')
order by tables.table_name;

-- 3. Column types, nullability and defaults required by both migrations.
select table_name, column_name, data_type, udt_schema, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('documents', 'document_versions', 'document_chunks', 'document_chunk_embeddings', 'hr_policies', 'policy_versions')
order by table_name, ordinal_position;

-- 4. Check constraints and foreign keys, including source_document_version_id.
select relation.relname as table_name, constraint_def.conname as constraint_name, pg_get_constraintdef(constraint_def.oid, true) as definition
from pg_constraint constraint_def
join pg_class relation on relation.oid = constraint_def.conrelid
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in ('documents', 'document_versions', 'document_chunks', 'document_chunk_embeddings', 'policy_versions')
order by relation.relname, constraint_def.conname;

-- 4b. Relevant indexes, including the expected vector cosine index after migration.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('documents', 'document_versions', 'document_chunks', 'document_chunk_embeddings', 'policy_versions')
order by tablename, indexname;

-- 5. RLS policies must remain limited to document managers for operational tables.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('documents', 'document_versions', 'document_chunks', 'document_chunk_embeddings', 'document_sync_runs', 'policy_versions')
order by tablename, policyname;

-- 6. Table grants: authenticated must not receive DELETE on document records.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('documents', 'document_versions', 'document_chunks', 'document_chunk_embeddings', 'document_sync_runs')
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

-- 7. Permission helper and RAG RPC signatures, settings and execute grants.
select procedure_schema, routine_name, specific_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('has_permission', 'match_policy_chunks');

select procedure.oid::regprocedure as signature, owner.rolname as owner, owner.rolsuper as owner_is_superuser, owner.rolbypassrls as owner_bypasses_rls, procedure.prosecdef as security_definer, procedure.proconfig, pg_get_functiondef(procedure.oid) as definition
from pg_proc procedure
join pg_namespace namespace on namespace.oid = procedure.pronamespace
join pg_roles owner on owner.oid = procedure.proowner
where namespace.nspname = 'public'
  and procedure.proname in ('has_permission', 'match_policy_chunks');

select procedure.oid::regprocedure as signature, coalesce(grantee.rolname, 'PUBLIC') as grantee, privilege.privilege_type, privilege.is_grantable
from pg_proc procedure
join pg_namespace namespace on namespace.oid = procedure.pronamespace
cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
left join pg_roles grantee on grantee.oid = privilege.grantee
where namespace.nspname = 'public'
  and procedure.proname = 'match_policy_chunks'
order by signature, grantee, privilege.privilege_type;

-- 8. Existing editorial/technical state counts, without exposing document content.
select document_status, count(*) as document_count
from public.documents
group by document_status
order by document_status;

select processing_status, count(*) as version_count
from public.document_versions
group by processing_status
order by processing_status;

-- 9. Relationship health: published/current policy versions should show only aggregate state.
select
  policy.status as policy_status,
  policy_version.is_current,
  document.document_status,
  document_version.processing_status,
  count(*) as relation_count
from public.policy_versions policy_version
join public.hr_policies policy on policy.id = policy_version.policy_id
left join public.document_versions document_version on document_version.id = policy_version.source_document_version_id
left join public.documents document on document.id = document_version.document_id
group by policy.status, policy_version.is_current, document.document_status, document_version.processing_status
order by policy.status, policy_version.is_current, document.document_status nulls first, document_version.processing_status nulls first;
