-- Local proposal only. Apply manually in the Supabase SQL Editor after review.
-- Technical processing belongs to document_versions.processing_status; this column
-- controls editorial visibility and must not publish a newly ingested document.

alter table public.documents
  drop constraint if exists documents_document_status_check;

update public.documents
set document_status = 'in_review'
where document_status = 'active';

alter table public.documents
  add constraint documents_document_status_check
  check (document_status in ('pending', 'in_review', 'published', 'archived', 'failed'));

-- Existing documents RLS remains restricted to documents.manage. Linking an approved
-- document version to a policy remains guarded by policies.manage on policy_versions.
-- The RAG RPC only returns a document after both editorial publication and a current,
-- published policy association are present.
