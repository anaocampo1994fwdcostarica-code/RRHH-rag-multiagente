# Activación manual de pgvector y RAG

Este procedimiento es para el proyecto Supabase de pruebas autorizado. No debe ejecutarse mediante Node.js, PowerShell automatizado ni contra producción.

## Prerrequisitos

- Las migraciones previas del repositorio están aplicadas y el esquema remoto coincide con la base local.
- Un operador autorizado puede usar SQL Editor del proyecto de pruebas.
- `supabase/manual_checks/` fue revisado y ejecutado manualmente.
- No hay datos con un estado documental distinto de `pending`, `active`, `archived` o `failed` antes de la migración editorial.
- Si la extensión `vector` existe, su esquema es `extensions`. Si se encuentra en otro esquema, detenerse: la migración actual usa `extensions.vector(768)` y debe revisarse antes de aplicar.

## Orden manual

1. Ejecutar las comprobaciones de solo lectura.
2. Revisar los resultados con la lista de aprobación siguiente.
3. Aplicar `20261119100000_add_policy_rag_pgvector.sql` manualmente.
4. Aplicar `20261119101000_add_document_editorial_review_states.sql` manualmente.
5. Volver a ejecutar las comprobaciones de solo lectura.

La primera migración crea la infraestructura. Antes de la segunda, el RPC puede existir pero no recuperará documentos porque aún no hay estado editorial `published`; esto es esperado.

## Condiciones de aprobación

- `documents`, `document_versions`, `document_chunks`, `hr_policies` y `policy_versions` existen con las columnas y FKs esperadas.
- `has_permission(text)` mantiene sus privilegios restringidos y `documents.manage` aparece en la matriz de permisos esperada.
- Tras aplicar, `document_chunk_embeddings` tiene RLS y únicamente la política de administración documental.
- `match_policy_chunks` es `SECURITY DEFINER`, tiene `search_path` fijo, no permite `PUBLIC`, `anon` ni `service_role`, y solo concede `EXECUTE` a `authenticated`.
- El RPC filtra documento editorial `published`, versión técnica `processed`, política publicada/no archivada y versión actual.
- `authenticated` no recibe `DELETE` sobre tablas documentales.

## Riesgos y recuperación

No se recomienda aplicar estas migraciones si las comprobaciones detectan una extensión `vector` fuera de `extensions`, cambios manuales de esquema, políticas RLS distintas o privilegios inesperados. Detenerse y revisar la migración local antes de continuar.

La migración editorial cambia `active` a `in_review`; no elimina datos. Si falla antes de añadir la nueva restricción, restaurar manualmente el check anterior y revisar el estado de la transacción en SQL Editor. No habilitar `ENABLE_DOCUMENT_SYNC` mientras las dos migraciones y las pruebas manuales de RLS/RPC no estén confirmadas.

## Verificación posterior

Comprobar de nuevo extensión, columnas, restricciones, RLS, grants y firma RPC con el archivo de lectura. Después, crear y revisar manualmente documentos ficticios autorizados mediante el flujo administrativo, enlazar una versión con `policy_versions.source_document_version_id`, publicar explícitamente el documento y validar que las citas de chat coincidan con la recuperación. Ningún documento procesado debe aparecer en RAG sin esos pasos editoriales.
