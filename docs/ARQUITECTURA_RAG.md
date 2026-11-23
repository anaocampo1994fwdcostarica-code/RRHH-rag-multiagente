# Arquitectura RAG

## Contrato del chat

`POST /api/chat` exige un JWT verificado por `requireAuth`. Para una consulta documental, el servidor devuelve:

```json
{
  "answer": "Respuesta basada en la evidencia recuperada.",
  "intent": "policy",
  "agent": "policy_rag",
  "evidenceStatus": "supported",
  "citations": []
}
```

Los estados de evidencia son `supported`, `insufficient`, `unavailable`, `restricted` y `out_of_scope`. Una respuesta solo es `supported` cuando el RPC recuperó fragmentos autorizados. Las citas se construyen exclusivamente desde esas filas; el modelo no puede inventarlas.

## Flujo previsto

1. El JWT se verifica antes de entrar al controlador.
2. El orquestador clasifica la consulta. Las consultas restringidas o mixtas no invocan el agente RAG.
3. El agente crea un embedding Gemini de 768 dimensiones, llama a `match_policy_chunks` mediante Supabase Data API y genera una respuesta con el contexto recuperado.
4. React presenta la respuesta, el estado de evidencia y únicamente enlaces HTTPS de `drive.google.com`.

Las dependencias se inyectan en pruebas y sus clientes son perezosos. Por tanto, las pruebas locales no generan llamadas a Gemini, Supabase ni Google Drive.

## Ingesta documental local

La ingesta prepara documentos provenientes de una carpeta permitida de Google Drive, extrae PDF, Docs y cada pestaña de Sheets, calcula hashes SHA-256 y genera fragmentos con secciones. Solo un flujo administrativo futuro con `documents.manage` podrá invocarla mediante Data API y RLS; no existe endpoint público ni sincronización programada. Las versiones anteriores dejan de participar en recuperación cuando la política se asocia a una versión vigente.

## Administración y publicación

`GET /api/admin/documents` y `POST /api/admin/documents/sync` requieren JWT y `documents.manage`. La sincronización rechaza cualquier cuerpo que intente indicar una carpeta y permanece bloqueada mientras `ENABLE_DOCUMENT_SYNC` no sea exactamente `true`.

La ingesta crea versiones con un estado técnico (`pending`, `processing`, `processed` o `failed`). La propuesta `20261119101000_add_document_editorial_review_states.sql` separa ese procesamiento del estado editorial del documento (`pending`, `in_review`, `published`, `archived`, `failed`). El RPC RAG requiere simultáneamente documento `published`, versión procesada y asociación con una versión actual de una política publicada. La asociación la controla `policies.manage` mediante `policy_versions.source_document_version_id`; la ingesta nunca publica ni enlaza políticas automáticamente.

## Migración pendiente

`supabase/migrations/20261119100000_add_policy_rag_pgvector.sql` es una propuesta local no aplicada. Añade `document_chunk_embeddings` con `extensions.vector(768)` y el RPC `match_policy_chunks`. El RPC usa `SECURITY DEFINER` de forma acotada para exponer exclusivamente fragmentos vinculados a versiones actuales de políticas publicadas, sin conceder lectura directa a documentos operativos. Debe revisarse y aplicarse manualmente en el SQL Editor del proyecto de pruebas antes de habilitar llamadas reales.

## Configuración y límites

`GEMINI_API_KEY` y `GEMINI_CHAT_MODEL` son variables solo de backend. Google Drive continúa deshabilitado hasta que exista una cuenta de servicio de solo lectura, una carpeta permitida y un flujo de ingesta aprobado. No se almacenan credenciales, JWT ni URL de base de datos en el frontend.

La recuperación, la generación y la ingesta externa no se han probado contra servicios reales en esta etapa.
