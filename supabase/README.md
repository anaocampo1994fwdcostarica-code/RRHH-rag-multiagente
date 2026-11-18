# Supabase schema

Apply `migrations/` in chronological order with the Supabase CLI only after review in a non-production project. Files in `templates/` and `seeds/` are intentionally not executable migrations.

`chunk_embeddings` is deferred until the embedding provider and vector dimension are confirmed. Do not replace `<dimension>` with an estimate.
