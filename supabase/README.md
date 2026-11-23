# Supabase schema

Apply `migrations/` in chronological order with the Supabase CLI only after review in a non-production project. Files in `templates/` and `seeds/` are intentionally not executable migrations.

`chunk_embeddings` is deferred until the embedding provider and vector dimension are confirmed. Do not replace `<dimension>` with an estimate.

## Rol de conexión para Express

La migración `20261118090000_create_rrhh_api_application_role.sql` crea
`rrhh_api` como el login restringido de Express. No recibe privilegios directos
sobre esquemas, tablas, secuencias ni funciones de `public`; su único permiso
directo de base de datos es `CONNECT`.

El rol es miembro de `authenticated` con `INHERIT FALSE`, `SET TRUE` y
`ADMIN FALSE`. Por tanto, debe ejecutar `SET LOCAL ROLE authenticated` dentro
de una transacción antes de consultar datos de negocio. Ese cambio activa los
grants existentes y las políticas RLS, mientras que las claims JWT se configuran
con alcance local a la misma transacción.

La migración no contiene contraseña. Antes de usar el rol en el Session Pooler,
un administrador debe asignarle una contraseña distinta de la de `postgres`
mediante un canal administrativo seguro, fuera de Git y de los archivos de
migración. La URL local de Express deberá usar el usuario
`rrhh_api.<project-ref>` y conservar TLS con CA y verificación de hostname.

Tras aplicar la migración únicamente en el proyecto de pruebas, validar mediante
consultas de solo lectura que `rrhh_api` tiene `LOGIN`, no tiene `BYPASSRLS`, no
es superusuario ni propietario de objetos, y que su membresía en
`authenticated` conserva `INHERIT FALSE` y `SET TRUE`. El ejecutor de integración
del backend exige `rrhh_api.<project-ref>` y debe probarse localmente antes de
configurar la nueva conexión.
